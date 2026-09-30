/**
 * Workflow service: submit → review → recommend → endorse → approve → publish,
 * with return-for-correction loops, rejection, reviewer assignment and corrections.
 */
import type { NotificationType, WorkflowAction } from "@/generated/prisma/client";
import { can, canAccessMda, isAgencyMember, type Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import type { WorkflowActionInput } from "@/lib/validations/budget";
import { checkTransition, type WorkflowActionKey } from "@/lib/workflow/machine";
import { audit } from "./audit";
import { publishAllocations } from "./execution-baseline";
import { agencyUsers, notifyUsers, usersWithPermission } from "./notifications";
import { getSettings } from "./settings";
import { signatureText } from "./submissions";
import { loadSubmissionBundle, storeValidationResults } from "./submission-data";
import { createVersion } from "./versions";

const AUDIT_ACTION: Record<WorkflowActionKey, "SUBMIT" | "RETURN" | "RECOMMEND" | "ENDORSE" | "APPROVE" | "REJECT" | "PUBLISH" | "REOPEN" | "UPDATE"> = {
  SUBMIT: "SUBMIT",
  RESUBMIT: "SUBMIT",
  WITHDRAW: "UPDATE",
  START_REVIEW: "UPDATE",
  RECOMMEND: "RECOMMEND",
  ENDORSE: "ENDORSE",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  RETURN: "RETURN",
  PUBLISH: "PUBLISH",
  REOPEN: "REOPEN",
};

const VERB: Record<WorkflowActionKey, string> = {
  SUBMIT: "submitted",
  RESUBMIT: "resubmitted",
  WITHDRAW: "withdrawn",
  START_REVIEW: "taken under review",
  RECOMMEND: "recommended",
  ENDORSE: "endorsed",
  APPROVE: "approved",
  REJECT: "rejected",
  RETURN: "returned for correction",
  PUBLISH: "published",
  REOPEN: "reopened",
};

/** Build the user-facing message listing blocking validation errors. */
function validationFailureMessage(action: string, errors: { name: string; message: string; details: string[] }[]) {
  const verb = action === "SUBMIT" || action === "RESUBMIT" ? "submit" : action.toLowerCase();
  return new ValidationFailedError(
    `Unable to ${verb} this budget. ${errors.length} validation error${errors.length === 1 ? "" : "s"} must be resolved before submission:`,
    {},
    errors.map((e, i) => `${i + 1}. ${e.name} — ${e.message}${e.details.length ? ` (${e.details.slice(0, 3).join("; ")})` : ""}`),
  );
}

export async function performWorkflowAction(actor: Actor, input: WorkflowActionInput) {
  const settings = await getSettings();
  const result = await prisma.$transaction(
    async (tx) => {
      const s = await tx.budgetSubmission.findUnique({
        where: { id: input.submissionId },
        include: { mda: true, budgetYear: true, certification: true },
      });
      if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
      const action = input.action as WorkflowActionKey;
      const bundle = await loadSubmissionBundle(tx, s.id, { locale: "en" });

      const check = checkTransition(
        s.status,
        action,
        { permissions: actor.permissions, hasMdaAccess: true, isAgencyMember: isAgencyMember(actor, s.mdaId) || (actor.allMdas && can(actor, "budget.prepare")) },
        { comment: input.comment, validationErrors: bundle.tally.errors },
      );
      if (!check.allowed) {
        if (check.reason === "VALIDATION_FAILED") {
          await storeValidationResults(tx, s.id, bundle.checks);
          throw validationFailureMessage(action, bundle.tally.blocking);
        }
        if (check.reason === "FORBIDDEN" || check.reason === "NO_MDA_ACCESS") throw new AuthorizationError(check.message);
        throw new BusinessRuleError(check.message);
      }
      const rule = check.rule;

      // ── Additional business rules ─────────────────────────────────────────
      if (action === "SUBMIT" && !["PREPARATION", "REVIEW"].includes(s.budgetYear.status)) {
        throw new BusinessRuleError(`Submissions for ${s.budgetYear.year} are closed (budget year status: ${s.budgetYear.status.toLowerCase()}).`);
      }
      if (action === "SUBMIT" || action === "RESUBMIT") {
        if (settings.budget.requireFullCertification && !(s.certification?.reviewedAt && s.certification?.approvedAt)) {
          throw new BusinessRuleError("The certification must be signed by the finance director (reviewed by) and the accounting officer (approved by) before submission.");
        }
        if (action === "RESUBMIT") {
          const open = await tx.correctionItem.findMany({ where: { submissionId: s.id, status: { in: ["OPEN", "REOPENED"] } } });
          if (open.length) {
            throw new BusinessRuleError(
              `Unable to resubmit this budget. ${open.length} correction${open.length === 1 ? "" : "s"} requested by the reviewer must be marked as resolved first:`,
              open.map((c, i) => `${i + 1}. Form ${c.form}${c.section ? ` — ${c.section}` : ""}: ${c.requiredCorrection}`),
            );
          }
        }
        // Sign the prepared-by certification on behalf of the submitting officer.
        if (!s.certification?.preparedAt && can(actor, "budget.certify.prepare")) {
          const at = new Date();
          const fields = { preparedByName: actor.name, preparedByTitle: actor.jobTitle, preparedById: actor.id, preparedAt: at, preparedSignature: signatureText(actor, "PREPARED", at) };
          await tx.certification.upsert({ where: { submissionId: s.id }, create: { submissionId: s.id, ...fields }, update: fields });
        }
      }
      if (["RECOMMEND", "ENDORSE", "APPROVE"].includes(action)) {
        const open = await tx.correctionItem.count({ where: { submissionId: s.id, status: { in: ["OPEN", "REOPENED"] } } });
        if (open > 0) throw new BusinessRuleError(`${open} correction item(s) are still open. Return the budget to the agency or verify the corrections first.`);
        await tx.correctionItem.updateMany({
          where: { submissionId: s.id, status: "RESOLVED" },
          data: { status: "ACCEPTED", verifiedById: actor.id, verifiedAt: new Date() },
        });
      }

      // ── Status change ─────────────────────────────────────────────────────
      const now = new Date();
      let assignedReviewerId = s.assignedReviewerId;
      if ((action === "SUBMIT" || action === "RESUBMIT") && !assignedReviewerId) {
        const assigned = await tx.userMdaAssignment.findFirst({ where: { mdaId: s.mdaId, type: "REVIEWER", user: { isActive: true, deletedAt: null } }, orderBy: { createdAt: "asc" } });
        assignedReviewerId = assigned?.userId ?? null;
      }
      if (action === "START_REVIEW" && !assignedReviewerId) assignedReviewerId = actor.id;

      await tx.budgetSubmission.update({
        where: { id: s.id },
        data: {
          status: rule.to,
          assignedReviewerId,
          ...(action === "SUBMIT" || action === "RESUBMIT" ? { submittedAt: now, submittedById: actor.id } : {}),
          ...(action === "APPROVE" ? { approvedAt: now, approvedById: actor.id, isLocked: true } : {}),
          ...(action === "REJECT" ? { rejectedAt: now } : {}),
          ...(action === "PUBLISH" ? { publishedAt: now } : {}),
          ...(action === "REOPEN" ? { rejectedAt: null } : {}),
        },
      });

      // Revisions supersede the approved budget they revise (the original stays immutable).
      if (action === "APPROVE" && s.type === "REVISION" && s.parentSubmissionId) {
        await tx.budgetSubmission.update({ where: { id: s.parentSubmissionId }, data: { supersededAt: now, supersededById: s.id } });
      }

      // ── Reviews and corrections ───────────────────────────────────────────
      if (rule.stage !== "PREPARATION" && rule.stage !== "PUBLICATION") {
        const decision = action === "START_REVIEW" ? null : (action as "RECOMMEND" | "ENDORSE" | "APPROVE" | "REJECT" | "RETURN");
        let review = await tx.budgetReview.findFirst({ where: { submissionId: s.id, stage: rule.stage, completedAt: null }, orderBy: { startedAt: "desc" } });
        if (!review) review = await tx.budgetReview.create({ data: { submissionId: s.id, stage: rule.stage, reviewerId: actor.id } });
        if (decision) {
          await tx.budgetReview.update({ where: { id: review.id }, data: { decision, summary: input.comment ?? null, completedAt: now, reviewerId: actor.id } });
        }
        if (action === "RETURN") {
          const items = input.corrections.length
            ? input.corrections
            : [{ form: "GENERAL" as const, section: null, field: null, comment: input.comment ?? "", requiredCorrection: input.comment ?? "" }];
          await tx.correctionItem.createMany({
            data: items.map((c) => ({
              submissionId: s.id,
              reviewId: review!.id,
              form: c.form,
              section: c.section ?? null,
              field: c.field ?? null,
              comment: c.comment,
              requiredCorrection: c.requiredCorrection,
              createdById: actor.id,
            })),
          });
        }
      }

      // ── Version snapshot ──────────────────────────────────────────────────
      let versionId: string | null = null;
      if (["SUBMIT", "RESUBMIT", "RETURN", "APPROVE", "REJECT", "WITHDRAW"].includes(action)) {
        const fresh = await loadSubmissionBundle(tx, s.id, { locale: "en" });
        const version = await createVersion(tx, actor, s.id, {
          reason: input.comment ?? `${VERB[action][0].toUpperCase()}${VERB[action].slice(1)}`,
          status: action === "RESUBMIT" ? "SUBMITTED" : rule.to,
          // Resubmissions after correction are labelled "Revised vN" (spec §19).
          label: action === "RESUBMIT" ? `Revised v${(await tx.budgetVersion.count({ where: { submissionId: s.id } })) + 1}` : undefined,
          bundle: fresh,
        });
        versionId = version.id;
        if (action === "SUBMIT" || action === "RESUBMIT") await storeValidationResults(tx, s.id, fresh.checks);
      }

      if (action === "PUBLISH") await publishAllocations(tx, s.id);

      await tx.approvalStep.create({
        data: {
          submissionId: s.id,
          versionId,
          stage: rule.stage,
          action: action as WorkflowAction,
          fromStatus: s.status,
          toStatus: rule.to,
          actorId: actor.id,
          actorName: actor.name,
          comment: input.comment ?? (action === "RETURN" && input.corrections.length ? `${input.corrections.length} correction(s) requested` : null),
        },
      });

      await audit(tx, actor, {
        action: AUDIT_ACTION[action],
        entityType: "BudgetSubmission",
        entityId: s.id,
        mdaId: s.mdaId,
        budgetYearId: s.budgetYearId,
        summary: `${s.budgetYear.year} budget of ${s.mda.code} — ${s.mda.name} ${VERB[action]}`,
        oldValue: { status: s.status },
        newValue: { status: rule.to, corrections: input.corrections.length || undefined },
        reason: input.comment ?? null,
      });

      await sendWorkflowNotifications(tx, actor, { ...s, assignedReviewerId }, action, rule.to, input);
      return { status: rule.to, versionId };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  return result;
}

async function sendWorkflowNotifications(
  tx: Tx,
  actor: Actor,
  s: { id: string; mdaId: string; assignedReviewerId: string | null; mda: { code: string; name: string }; budgetYear: { year: number } },
  action: WorkflowActionKey,
  _to: string,
  input: WorkflowActionInput,
) {
  const label = `${s.mda.code} — ${s.mda.name} (${s.budgetYear.year})`;
  const link = `/budget/workspace/${s.id}`;
  const base = { link, entityType: "BudgetSubmission", entityId: s.id };
  const agency = (await agencyUsers(tx, s.mdaId)).filter((id) => id !== actor.id);
  const send = async (ids: string[], type: NotificationType, title: string, body: string) => notifyUsers(tx, ids.filter((id) => id !== actor.id), { type, title, body, ...base });

  switch (action) {
    case "SUBMIT":
    case "RESUBMIT": {
      const reviewers = s.assignedReviewerId ? [s.assignedReviewerId] : await usersWithPermission(tx, "review.stage1", s.mdaId);
      await send(reviewers, "BUDGET_SUBMITTED", `Budget ${action === "RESUBMIT" ? "resubmitted" : "submitted"}: ${label}`, `${actor.name} ${action === "RESUBMIT" ? "resubmitted" : "submitted"} the budget for review.`);
      if (s.assignedReviewerId) await send([s.assignedReviewerId], "REVIEW_ASSIGNED", `New review assigned: ${label}`, "You are the assigned reviewer for this budget.");
      break;
    }
    case "START_REVIEW":
      await send(agency, "REVIEW_STAGE_ADVANCED", `Budget under review: ${label}`, `${actor.name} started reviewing your budget.`);
      break;
    case "RETURN":
      await send(agency, "BUDGET_RETURNED", `Budget returned for correction: ${label}`, input.comment ?? "The reviewer returned the budget for correction.");
      await send(agency, "CORRECTION_REQUIRED", `Correction required: ${label}`, `${Math.max(1, input.corrections.length)} correction(s) must be resolved before resubmission.`);
      break;
    case "RECOMMEND":
      await send(await usersWithPermission(tx, "review.stage2", s.mdaId), "REVIEW_STAGE_ADVANCED", `Budget recommended: ${label}`, `${actor.name} recommended this budget. Director review is required.`);
      await send(agency, "REVIEW_STAGE_ADVANCED", `Budget recommended: ${label}`, "Your budget passed the budget officer review.");
      break;
    case "ENDORSE":
      await send(await usersWithPermission(tx, "review.final", s.mdaId), "REVIEW_STAGE_ADVANCED", `Budget awaiting final approval: ${label}`, `${actor.name} endorsed this budget.`);
      break;
    case "APPROVE": {
      const admins = await usersWithPermission(tx, "budget.publish", s.mdaId);
      await send([...agency, ...(s.assignedReviewerId ? [s.assignedReviewerId] : [])], "BUDGET_APPROVED", `Budget approved: ${label}`, "The budget has received final approval and is now locked.");
      await send(admins, "BUDGET_APPROVED", `Budget approved: ${label}`, "The approved budget can now be published for execution.");
      break;
    }
    case "REJECT":
      await send(agency, "BUDGET_REJECTED", `Budget rejected: ${label}`, input.comment ?? "The budget was rejected.");
      break;
    case "PUBLISH":
      await send(agency, "BUDGET_PUBLISHED", `Budget published: ${label}`, "The approved budget is published and available for execution.");
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer assignment and corrections
// ─────────────────────────────────────────────────────────────────────────────

export async function assignReviewer(actor: Actor, submissionId: string, reviewerId: string) {
  if (!can(actor, "review.assign")) throw new AuthorizationError("You do not have permission to assign reviewers.");
  return prisma.$transaction(async (tx) => {
    const s = await tx.budgetSubmission.findUnique({ where: { id: submissionId }, include: { mda: true, budgetYear: true } });
    if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
    const reviewers = await usersWithPermission(tx, "review.stage1", s.mdaId);
    if (!reviewers.includes(reviewerId)) throw new BusinessRuleError("The selected user cannot review this budget (missing reviewer permission or MDA access).");
    await tx.budgetSubmission.update({ where: { id: submissionId }, data: { assignedReviewerId: reviewerId } });
    const reviewer = await tx.user.findUniqueOrThrow({ where: { id: reviewerId }, select: { fullName: true } });
    await tx.approvalStep.create({
      data: { submissionId, stage: "BUDGET_OFFICER_REVIEW", action: "ASSIGN", fromStatus: s.status, toStatus: s.status, actorId: actor.id, actorName: actor.name, comment: `Assigned to ${reviewer.fullName}` },
    });
    await audit(tx, actor, { action: "ASSIGN", entityType: "BudgetSubmission", entityId: submissionId, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `Reviewer assigned: ${reviewer.fullName}`, oldValue: { assignedReviewerId: s.assignedReviewerId }, newValue: { assignedReviewerId: reviewerId } });
    await notifyUsers(tx, [reviewerId], {
      type: "REVIEW_ASSIGNED",
      title: `New review assigned: ${s.mda.code} — ${s.mda.name} (${s.budgetYear.year})`,
      body: `${actor.name} assigned this budget to you for review.`,
      link: `/budget/workspace/${submissionId}`,
      entityType: "BudgetSubmission",
      entityId: submissionId,
    });
  });
}

/** Agency marks a requested correction as resolved. */
export async function resolveCorrection(actor: Actor, correctionId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.correctionItem.findUnique({ where: { id: correctionId }, include: { submission: { include: { mda: true, budgetYear: true } } } });
    if (!c || !canAccessMda(actor, c.submission.mdaId)) throw new NotFoundError("correction");
    if (!can(actor, "budget.prepare") || !(isAgencyMember(actor, c.submission.mdaId) || actor.allMdas)) throw new AuthorizationError("Only the agency's budget staff can resolve corrections.");
    if (c.submission.status !== "RETURNED") throw new BusinessRuleError("Corrections can only be resolved while the budget is returned for correction.");
    if (!["OPEN", "REOPENED"].includes(c.status)) throw new BusinessRuleError("This correction is already resolved.");
    if (!note.trim()) throw new ValidationFailedError("Describe how the correction was resolved.");
    await tx.correctionItem.update({ where: { id: correctionId }, data: { status: "RESOLVED", resolutionNote: note.trim(), resolvedById: actor.id, resolvedAt: new Date() } });
    await audit(tx, actor, { action: "UPDATE", entityType: "CorrectionItem", entityId: correctionId, mdaId: c.submission.mdaId, budgetYearId: c.submission.budgetYearId, summary: `Correction resolved (Form ${c.form})`, oldValue: { status: c.status }, newValue: { status: "RESOLVED", resolutionNote: note.trim() } });
    if (c.createdById) {
      await notifyUsers(tx, [c.createdById], {
        type: "CORRECTION_RESOLVED",
        title: `Correction resolved: ${c.submission.mda.code} (${c.submission.budgetYear.year})`,
        body: note.trim().slice(0, 300),
        link: `/budget/workspace/${c.submissionId}/review`,
        entityType: "BudgetSubmission",
        entityId: c.submissionId,
      });
    }
  });
}

/** Reviewer accepts or reopens a resolved correction. */
export async function verifyCorrection(actor: Actor, correctionId: string, accept: boolean, note?: string | null) {
  if (!can(actor, "review.stage1") && !can(actor, "review.stage2") && !can(actor, "review.final")) throw new AuthorizationError();
  return prisma.$transaction(async (tx) => {
    const c = await tx.correctionItem.findUnique({ where: { id: correctionId }, include: { submission: true } });
    if (!c || !canAccessMda(actor, c.submission.mdaId)) throw new NotFoundError("correction");
    if (c.status !== "RESOLVED") throw new BusinessRuleError("Only resolved corrections can be verified.");
    const status = accept ? "ACCEPTED" : "REOPENED";
    await tx.correctionItem.update({ where: { id: correctionId }, data: { status, verifiedById: actor.id, verifiedAt: new Date(), ...(note ? { resolutionNote: `${c.resolutionNote ?? ""}\nReviewer: ${note}`.trim() } : {}) } });
    await audit(tx, actor, { action: "UPDATE", entityType: "CorrectionItem", entityId: correctionId, mdaId: c.submission.mdaId, budgetYearId: c.submission.budgetYearId, summary: `Correction ${accept ? "accepted" : "reopened"}`, oldValue: { status: c.status }, newValue: { status }, reason: note ?? null });
  });
}

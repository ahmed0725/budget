import "server-only";
import { cache } from "react";
import { can, isAgencyMember } from "@/lib/auth/actor";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getCodesForYear, getLookups } from "@/lib/services/reference";
import { canEditSubmission, getBundleForActor } from "@/lib/services/submissions";
import { availableActions, stageOfStatus, type SubmissionStatus } from "@/lib/workflow/machine";
import { notFound } from "next/navigation";

/** Load the workspace once per request (layout + page share it). */
export const getWorkspace = cache(async (id: string) => {
  const actor = await requireActor();
  let bundle;
  try {
    bundle = await getBundleForActor(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const s = bundle.submission;
  const canEdit = canEditSubmission(actor, s);
  const actions = availableActions(s.status as SubmissionStatus, {
    permissions: actor.permissions,
    hasMdaAccess: true,
    isAgencyMember: isAgencyMember(actor, s.mdaId) || (actor.allMdas && can(actor, "budget.prepare")),
  }).map((a) => ({ action: a.action, requiresComment: a.requiresComment, requiresValidation: a.requiresValidation, to: a.to }));
  const openCorrections = await prisma.correctionItem.count({ where: { submissionId: id, status: { in: ["OPEN", "REOPENED"] } } });

  const header = {
    id: s.id,
    status: s.status,
    type: s.type,
    revisionType: s.revisionType,
    revisionNumber: s.revisionNumber,
    revisionReason: s.revisionReason,
    parentSubmissionId: s.parentSubmissionId,
    isLocked: s.isLocked,
    source: s.source,
    year: s.budgetYear.year,
    yearId: s.budgetYearId,
    yearStatus: s.budgetYear.status,
    deadline: s.budgetYear.submissionDeadline?.toISOString() ?? null,
    mda: { id: s.mda.id, code: s.mda.code, name: s.mda.name, nameEn: s.mda.nameEn, sector: s.mda.sector.name },
    updatedAt: s.updatedAt.toISOString(),
    submittedAt: s.submittedAt?.toISOString() ?? null,
    submittedBy: s.submittedBy?.fullName ?? null,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    assignedReviewer: s.assignedReviewer ? { id: s.assignedReviewer.id, name: s.assignedReviewer.fullName } : null,
    completion: bundle.completion,
    overallCompletion: bundle.overallCompletion,
    tally: { passed: bundle.tally.passed, warnings: bundle.tally.warnings, errors: bundle.tally.errors, total: bundle.tally.total },
    totals: bundle.summary.totals,
    stage: stageOfStatus(s.status as SubmissionStatus),
    openCorrections,
  };
  return {
    actor,
    bundle,
    header,
    canEdit,
    actions,
    permissions: {
      canValidate: can(actor, "budget.view"),
      canSaveVersion: canEdit,
      canRestore: canEdit && can(actor, "budget.version.restore"),
      canAssign: can(actor, "review.assign"),
      canComment: can(actor, "comments.create"),
      canUpload: can(actor, "attachments.upload"),
      canExport: can(actor, "export.run"),
      canRevise: (can(actor, "budget.revision.create") || (can(actor, "budget.prepare") && isAgencyMember(actor, s.mdaId))) && ["APPROVED", "PUBLISHED"].includes(s.status) && !s.supersededAt,
      isReviewer: can(actor, "review.stage1") || can(actor, "review.stage2") || can(actor, "review.final"),
      isAgency: isAgencyMember(actor, s.mdaId) || (actor.allMdas && can(actor, "budget.prepare")),
    },
  };
});

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type WorkspaceHeader = Workspace["header"];

/** Classification codes for a form (postable codes effective in the year). */
export const getFormCodes = cache(async (kind: "REVENUE" | "EXPENDITURE", year: number) => {
  const codes = await getCodesForYear(kind, year, { postableOnly: true });
  return codes.map((c) => ({ id: c.id, code: c.code, name: c.name, nameEn: c.nameEn, categoryId: c.categoryId }));
});

export const getFormLookups = cache(async () => {
  const [funding, methods] = await Promise.all([getLookups("FUNDING_SOURCE"), getLookups("PROCUREMENT_METHOD")]);
  const map = (l: { id: string; code: string; name: string; nameEn: string | null }) => ({ id: l.id, code: l.code, name: l.name, nameEn: l.nameEn });
  return { funding: funding.map(map), methods: methods.map(map) };
});

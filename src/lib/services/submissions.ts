/**
 * Budget submission service (budgetService): creating budgets and revisions,
 * access control, and every form mutation (Forms A–H). All financial values are
 * recalculated on the server after each change.
 */
import type { Prisma, SubmissionStatus } from "@/generated/prisma/client";
import { can, canAccessMda, isAgencyMember, mdaScope, visibleStatuses, type Actor } from "@/lib/auth/actor";
import { calculatePersonnelCost, spreadAcrossQuarters, sum, toAmount } from "@/lib/calculations";
import { prisma, type Tx } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import type {
  FormAInput,
  FormBInput,
  FormCInput,
  FormDInput,
  FormEInput,
  FormFInput,
  FormGInput,
  FormHInput,
} from "@/lib/validations/budget";
import { isEditableStatus } from "@/lib/workflow/machine";
import { audit, changedFields } from "./audit";
import { getCategories } from "./reference";
import { findEffectiveApproved, loadSubmissionBundle, refreshSubmissionTotals, storeValidationResults, type SubmissionBundle } from "./submission-data";
import { createVersion } from "./versions";

type Client = Tx | typeof prisma;

// ─────────────────────────────────────────────────────────────────────────────
// Access
// ─────────────────────────────────────────────────────────────────────────────

/** Load a submission header if the actor may see it; otherwise NotFound (no information leak). */
export async function getSubmissionHeader(actor: Actor, submissionId: string, client: Client = prisma) {
  const submission = await client.budgetSubmission.findUnique({
    where: { id: submissionId },
    include: { mda: true, budgetYear: true },
  });
  if (!submission || !can(actor, "budget.view") || !canAccessMda(actor, submission.mdaId)) throw new NotFoundError("budget submission");
  const statuses = visibleStatuses(actor);
  if (statuses && !statuses.includes(submission.status as "APPROVED" | "PUBLISHED")) throw new NotFoundError("budget submission");
  return submission;
}

export async function getBundleForActor(actor: Actor, submissionId: string): Promise<SubmissionBundle> {
  await getSubmissionHeader(actor, submissionId);
  return loadSubmissionBundle(prisma, submissionId, { locale: actor.locale });
}

/** Whether the actor may edit the forms of this submission right now. */
export function canEditSubmission(actor: Actor, submission: { mdaId: string; status: SubmissionStatus; isLocked: boolean }): boolean {
  if (submission.isLocked || !isEditableStatus(submission.status)) return false;
  if (!can(actor, "budget.prepare")) return false;
  return isAgencyMember(actor, submission.mdaId) || actor.allMdas;
}

async function loadForEdit(tx: Tx, actor: Actor, submissionId: string, revision?: string | null) {
  const submission = await tx.budgetSubmission.findUnique({ where: { id: submissionId }, include: { mda: true, budgetYear: true } });
  if (!submission || !canAccessMda(actor, submission.mdaId)) throw new NotFoundError("budget submission");
  if (!can(actor, "budget.prepare") || !(isAgencyMember(actor, submission.mdaId) || actor.allMdas)) {
    throw new AuthorizationError("Only the agency's budget staff can edit this budget.");
  }
  if (submission.isLocked || !isEditableStatus(submission.status)) {
    throw new BusinessRuleError(
      submission.isLocked
        ? "This budget has been approved and is locked. Create a budget revision to make changes."
        : `This budget is ${submission.status.toLowerCase().replace("_", " ")} and cannot be edited until it is returned for correction.`,
    );
  }
  if (revision && submission.updatedAt.toISOString() !== revision) {
    throw new BusinessRuleError("This budget was changed by another user since you opened it. Reload the page to see the latest data, then re-apply your changes.");
  }
  return submission;
}

/** Run a form mutation in a transaction and refresh the server-side totals. */
async function mutate<T>(actor: Actor, submissionId: string, revision: string | null | undefined, fn: (tx: Tx, submission: Awaited<ReturnType<typeof loadForEdit>>) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      const submission = await loadForEdit(tx, actor, submissionId, revision);
      const result = await fn(tx, submission);
      await tx.budgetSubmission.update({ where: { id: submissionId }, data: { updatedAt: new Date() } });
      const bundle = await refreshSubmissionTotals(tx, submissionId);
      return { result, bundle, updatedAt: (await tx.budgetSubmission.findUniqueOrThrow({ where: { id: submissionId }, select: { updatedAt: true } })).updatedAt.toISOString() };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmissionFilters {
  year?: number;
  budgetYearId?: string;
  mdaId?: string;
  sectorId?: string;
  status?: SubmissionStatus[];
  search?: string;
  assignedToMe?: boolean;
  type?: "ORIGINAL" | "REVISION";
  sort?: string | null;
  page?: number;
  pageSize?: number;
}

const SUBMISSION_SORTS: Record<string, (dir: "asc" | "desc") => Prisma.BudgetSubmissionOrderByWithRelationInput[]> = {
  mda: (dir) => [{ mda: { code: dir } }],
  year: (dir) => [{ budgetYear: { year: dir } }, { mda: { code: "asc" } }],
  status: (dir) => [{ status: dir }],
  totalExpenditure: (dir) => [{ totalExpenditure: dir }],
  totalRevenue: (dir) => [{ totalRevenue: dir }],
  completion: (dir) => [{ completion: dir }],
  validation: (dir) => [{ validationErrors: dir }, { validationWarnings: dir }],
  submittedAt: (dir) => [{ submittedAt: { sort: dir, nulls: "last" } }],
  updatedAt: (dir) => [{ updatedAt: dir }],
};

export async function listSubmissions(actor: Actor, filters: SubmissionFilters = {}) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 5), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const statuses = visibleStatuses(actor);
  const scope = mdaScope(actor);
  const where: Prisma.BudgetSubmissionWhereInput = {
    ...(scope ? { mdaId: scope } : {}),
    ...(filters.mdaId ? { mdaId: filters.mdaId, ...(scope && !scope.in.includes(filters.mdaId) ? { id: "__none__" } : {}) } : {}),
    ...(filters.budgetYearId ? { budgetYearId: filters.budgetYearId } : {}),
    ...(filters.year ? { budgetYear: { year: filters.year } } : {}),
    ...(filters.sectorId ? { mda: { sectorId: filters.sectorId } } : {}),
    ...(filters.assignedToMe ? { assignedReviewerId: actor.id } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    status: filters.status?.length ? { in: statuses ? filters.status.filter((s) => statuses.includes(s as "APPROVED")) : filters.status } : statuses ? { in: statuses } : undefined,
    ...(filters.search
      ? { OR: [{ mda: { code: { contains: filters.search } } }, { mda: { name: { contains: filters.search } } }, { mda: { nameEn: { contains: filters.search } } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.budgetSubmission.count({ where }),
    prisma.budgetSubmission.findMany({
      where,
      include: {
        mda: { select: { id: true, code: true, name: true, nameEn: true, sector: { select: { code: true, name: true } } } },
        budgetYear: { select: { id: true, year: true, submissionDeadline: true } },
        assignedReviewer: { select: { id: true, fullName: true } },
      },
      orderBy: (() => {
        const [key, dir] = (filters.sort ?? "").split(".");
        const fn = SUBMISSION_SORTS[key];
        return fn ? [...fn(dir === "desc" ? "desc" : "asc"), { revisionNumber: "asc" as const }] : [{ budgetYear: { year: "desc" as const } }, { mda: { code: "asc" as const } }, { revisionNumber: "asc" as const }];
      })(),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creation and revisions
// ─────────────────────────────────────────────────────────────────────────────

export async function createSubmission(actor: Actor, input: { budgetYearId: string; mdaId: string; prefill: "EMPTY" | "PRIOR_YEAR" }) {
  if (!can(actor, "budget.prepare")) throw new AuthorizationError("You do not have permission to create budgets.");
  if (!(isAgencyMember(actor, input.mdaId) || actor.allMdas)) throw new AuthorizationError("You can only create budgets for your own MDA.");

  return prisma.$transaction(
    async (tx) => {
      const year = await tx.budgetYear.findUnique({ where: { id: input.budgetYearId } });
      const mda = await tx.mda.findUnique({ where: { id: input.mdaId }, include: { sector: true, category: true } });
      if (!year) throw new NotFoundError("budget year");
      if (!mda || !mda.isActive || mda.deletedAt) throw new NotFoundError("MDA");
      if (!["PREPARATION", "DRAFT"].includes(year.status)) {
        throw new BusinessRuleError(`Budget preparation for ${year.year} is not open (status: ${year.status.toLowerCase()}).`);
      }
      const existing = await tx.budgetSubmission.findFirst({ where: { budgetYearId: year.id, mdaId: mda.id, type: "ORIGINAL" } });
      if (existing) throw new BusinessRuleError(`A ${year.year} budget already exists for ${mda.code} — ${mda.name}.`, [existing.id]);

      const submission = await tx.budgetSubmission.create({
        data: {
          budgetYearId: year.id,
          mdaId: mda.id,
          status: "DRAFT",
          allocationNumber: mda.code,
          agencyCategory: mda.category?.name ?? mda.sector.name,
          accountingOfficer: mda.accountingOfficer,
          contactPerson: mda.contactPerson ?? mda.budgetOfficer,
          telephone: mda.phone,
          email: mda.email,
          createdById: actor.id,
        },
      });
      await tx.cashFlowForecast.createMany({ data: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ submissionId: submission.id, quarter, amount: 0 })) });

      let copied = 0;
      if (input.prefill === "PRIOR_YEAR") {
        const prior = await findEffectiveApproved(tx, mda.id, year.year - 1);
        if (prior) {
          const lines = await tx.budgetLine.findMany({ where: { submissionId: prior.id, capitalProjectId: null }, include: { budgetCode: true } });
          const usable = lines.filter(
            (l) => l.budgetCode.isActive && l.budgetCode.isPostable && (l.budgetCode.effectiveToYear === null || l.budgetCode.effectiveToYear >= year.year),
          );
          if (usable.length) {
            await tx.budgetLine.createMany({
              data: usable.map((l, i) => ({
                submissionId: submission.id,
                budgetCodeId: l.budgetCodeId,
                kind: l.kind,
                description: l.description,
                amount: l.amount,
                sortOrder: i,
                source: "MANUAL" as const,
                sourceRef: `Copied from ${year.year - 1} approved budget`,
                createdById: actor.id,
              })),
            });
            copied = usable.length;
          }
          const personnel = await tx.personnelBudget.findMany({ where: { submissionId: prior.id } });
          if (personnel.length) {
            await tx.personnelBudget.createMany({
              data: personnel.map((p) => ({
                submissionId: submission.id,
                positionTitle: p.positionTitle,
                grade: p.grade,
                department: p.department,
                budgetCodeId: p.budgetCodeId,
                approvedEstablishment: p.approvedEstablishment,
                filledPositions: p.filledPositions,
                monthlyCost: p.monthlyCost,
                annualCost: p.annualCost,
                remarks: p.remarks,
                sortOrder: p.sortOrder,
              })),
            });
          }
          // Ongoing multi-year projects continue into the new year with a zero allocation.
          const projects = await tx.budgetLine.findMany({
            where: { submissionId: prior.id, capitalProjectId: { not: null }, capitalProject: { status: { in: ["APPROVED", "ACTIVE"] }, deletedAt: null } },
          });
          for (const pl of projects) {
            await tx.budgetLine.create({
              data: { submissionId: submission.id, budgetCodeId: pl.budgetCodeId, kind: "EXPENDITURE", capitalProjectId: pl.capitalProjectId, amount: 0, source: "MANUAL", sourceRef: "Ongoing project", createdById: actor.id },
            });
          }
        }
      }

      await tx.approvalStep.create({
        data: { submissionId: submission.id, stage: "PREPARATION", action: "CREATE", toStatus: "DRAFT", actorId: actor.id, actorName: actor.name, comment: copied ? `${copied} line(s) copied from the prior-year approved budget` : null },
      });
      await audit(tx, actor, {
        action: "CREATE",
        entityType: "BudgetSubmission",
        entityId: submission.id,
        mdaId: mda.id,
        budgetYearId: year.id,
        summary: `Created ${year.year} budget for ${mda.code} — ${mda.name}`,
        newValue: { status: "DRAFT", prefill: input.prefill, copiedLines: copied },
      });
      await refreshSubmissionTotals(tx, submission.id);
      return submission;
    },
    { timeout: 60_000 },
  );
}

/** Start a revision (supplementary budget, reallocation, …) of an approved budget. */
export async function createRevision(actor: Actor, input: { submissionId: string; revisionType: "SUPPLEMENTARY" | "REALLOCATION" | "BUDGET_CUT" | "BUDGET_INCREASE" | "AGENCY_ADJUSTMENT"; reason: string }) {
  if (!can(actor, "budget.revision.create") && !can(actor, "budget.prepare")) throw new AuthorizationError("You do not have permission to create budget revisions.");
  return prisma.$transaction(
    async (tx) => {
      const original = await tx.budgetSubmission.findUnique({ where: { id: input.submissionId }, include: { mda: true, budgetYear: true } });
      if (!original || !canAccessMda(actor, original.mdaId)) throw new NotFoundError("budget submission");
      if (!can(actor, "budget.revision.create") && !isAgencyMember(actor, original.mdaId)) throw new AuthorizationError();
      if (!["APPROVED", "PUBLISHED"].includes(original.status) || original.supersededAt) {
        throw new BusinessRuleError("Only the approved budget currently in force can be revised.");
      }
      const open = await tx.budgetSubmission.findFirst({
        where: { budgetYearId: original.budgetYearId, mdaId: original.mdaId, type: "REVISION", status: { notIn: ["APPROVED", "PUBLISHED", "REJECTED"] } },
      });
      if (open) throw new BusinessRuleError("A revision of this budget is already in progress.", [open.id]);
      const maxRev = await tx.budgetSubmission.aggregate({ where: { budgetYearId: original.budgetYearId, mdaId: original.mdaId }, _max: { revisionNumber: true } });
      const revisionNumber = (maxRev._max.revisionNumber ?? 0) + 1;

      const revision = await tx.budgetSubmission.create({
        data: {
          budgetYearId: original.budgetYearId,
          mdaId: original.mdaId,
          type: "REVISION",
          revisionType: input.revisionType,
          revisionNumber,
          parentSubmissionId: original.id,
          revisionReason: input.reason,
          status: "DRAFT",
          allocationNumber: original.allocationNumber,
          agencyCategory: original.agencyCategory,
          accountingOfficer: original.accountingOfficer,
          contactPerson: original.contactPerson,
          telephone: original.telephone,
          email: original.email,
          createdById: actor.id,
        },
      });
      const lines = await tx.budgetLine.findMany({ where: { submissionId: original.id } });
      const personnel = await tx.personnelBudget.findMany({ where: { submissionId: original.id } });
      const procurement = await tx.procurementPlan.findMany({ where: { submissionId: original.id } });
      const cashFlow = await tx.cashFlowForecast.findMany({ where: { submissionId: original.id } });
      const notes = await tx.submissionNote.findMany({ where: { submissionId: original.id } });
      if (lines.length)
        await tx.budgetLine.createMany({
          data: lines.map(({ id: _id, submissionId: _s, createdAt: _c, updatedAt: _u, ...l }) => ({ ...l, submissionId: revision.id, source: "MANUAL" as const, sourceRef: `Revision ${revisionNumber} of approved budget` })),
        });
      if (personnel.length) await tx.personnelBudget.createMany({ data: personnel.map(({ id: _id, submissionId: _s, createdAt: _c, updatedAt: _u, ...p }) => ({ ...p, submissionId: revision.id })) });
      if (procurement.length) await tx.procurementPlan.createMany({ data: procurement.map(({ id: _id, submissionId: _s, createdAt: _c, updatedAt: _u, ...p }) => ({ ...p, submissionId: revision.id })) });
      const quarters = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
        const c = cashFlow.find((x) => x.quarter === q);
        return { submissionId: revision.id, quarter: q, amount: c?.amount ?? 0, remarks: c?.remarks ?? null };
      });
      await tx.cashFlowForecast.createMany({ data: quarters });
      if (notes.length) await tx.submissionNote.createMany({ data: notes.map((n) => ({ submissionId: revision.id, form: n.form, key: n.key, text: n.text, updatedById: actor.id })) });

      await tx.approvalStep.create({
        data: { submissionId: revision.id, stage: "PREPARATION", action: "REVISION_CREATED", toStatus: "DRAFT", actorId: actor.id, actorName: actor.name, comment: `${input.revisionType}: ${input.reason}` },
      });
      await audit(tx, actor, {
        action: "CREATE",
        entityType: "BudgetRevision",
        entityId: revision.id,
        mdaId: original.mdaId,
        budgetYearId: original.budgetYearId,
        summary: `Revision ${revisionNumber} (${input.revisionType}) of the ${original.budgetYear.year} budget of ${original.mda.code}`,
        newValue: { parentSubmissionId: original.id, revisionType: input.revisionType },
        reason: input.reason,
      });
      await refreshSubmissionTotals(tx, revision.id);
      return revision;
    },
    { timeout: 60_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Code checks
// ─────────────────────────────────────────────────────────────────────────────

async function assertCodes(tx: Tx, codeIds: string[], kind: "REVENUE" | "EXPENDITURE", year: number, opts: { capital?: boolean } = {}) {
  const unique = [...new Set(codeIds)];
  if (unique.length === 0) return new Map<string, { id: string; code: string; categoryId: string | null }>();
  const codes = await tx.budgetCode.findMany({ where: { id: { in: unique } }, include: { category: true } });
  const problems: string[] = [];
  for (const id of unique) {
    const c = codes.find((x) => x.id === id);
    if (!c) {
      problems.push(`Unknown classification code (${id})`);
      continue;
    }
    if (c.kind !== kind) problems.push(`${c.code} is not a ${kind.toLowerCase()} code`);
    if (!c.isActive) problems.push(`${c.code} is inactive`);
    if (c.effectiveFromYear > year || (c.effectiveToYear !== null && c.effectiveToYear < year)) problems.push(`${c.code} is not effective for ${year}`);
    if (opts.capital !== undefined && kind === "EXPENDITURE") {
      const isCap = Boolean(c.category?.isCapital);
      if (opts.capital && !isCap) problems.push(`${c.code} is not a capital expenditure code`);
      if (!opts.capital && isCap) problems.push(`${c.code} is a capital code — record it as a project in Form F`);
    }
  }
  if (problems.length) throw new ValidationFailedError("Some classification codes cannot be used.", {}, problems);
  return new Map(codes.map((c) => [c.id, { id: c.id, code: c.code, categoryId: c.categoryId }]));
}

async function upsertNote(tx: Tx, actor: Actor, submissionId: string, form: "B" | "C" | "D" | "F" | "G", key: string, text: string | null | undefined) {
  const value = text?.trim() ?? "";
  if (!value) {
    await tx.submissionNote.deleteMany({ where: { submissionId, form, key } });
    return;
  }
  await tx.submissionNote.upsert({
    where: { submissionId_form_key: { submissionId, form, key } },
    create: { submissionId, form, key, text: value, updatedById: actor.id },
    update: { text: value, updatedById: actor.id },
  });
}

function changeSummary(label: string, added: number, updated: number, removed: number, before?: number, after?: number) {
  const parts = [`${label}: ${added} added, ${updated} updated, ${removed} removed`];
  if (before !== undefined && after !== undefined && before !== after) parts.push(`total ${before.toLocaleString("en-US")} → ${after.toLocaleString("en-US")}`);
  return parts.join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Form A
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormA(actor: Actor, submissionId: string, input: FormAInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const diff = changedFields(s as unknown as Record<string, unknown>, input);
    await tx.budgetSubmission.update({ where: { id: submissionId }, data: input });
    if (diff) {
      await audit(tx, actor, { action: "UPDATE", entityType: "FormA", entityId: submissionId, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: "Form A (agency summary) updated", ...diff });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Form B — explanations only (values are derived from Forms D and F)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormB(actor: Actor, submissionId: string, input: FormBInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const before = await tx.submissionNote.findMany({ where: { submissionId, form: "B" } });
    for (const [key, text] of Object.entries(input.notes)) await upsertNote(tx, actor, submissionId, "B", key, text);
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormB",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: "Form B explanations updated",
      oldValue: Object.fromEntries(before.map((n) => [n.key, n.text])),
      newValue: input.notes,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Line-based forms (C, D)
// ─────────────────────────────────────────────────────────────────────────────

type LineInput = FormDInput["lines"][number] & { priorYearActual?: number | null; currentYearEstimate?: number | null };

async function replaceLines(tx: Tx, actor: Actor, submission: { id: string; mdaId: string; budgetYearId: string; budgetYear: { year: number } }, kind: "REVENUE" | "EXPENDITURE", lines: LineInput[]) {
  await assertCodes(tx, lines.map((l) => l.budgetCodeId), kind, submission.budgetYear.year, kind === "EXPENDITURE" ? { capital: false } : {});
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.budgetCodeId)) {
      const code = await tx.budgetCode.findUnique({ where: { id: l.budgetCodeId }, select: { code: true } });
      throw new ValidationFailedError("Each classification code can appear only once.", {}, [`Code ${code?.code} is listed more than once — combine the amounts into one line.`]);
    }
    seen.add(l.budgetCodeId);
  }

  const existing = await tx.budgetLine.findMany({
    where: { submissionId: submission.id, kind, capitalProjectId: null, ...(kind === "EXPENDITURE" ? { budgetCode: { category: { isCapital: false } } } : {}) },
  });
  // Lines whose code has no category are still recurrent expenditure.
  const existingUncategorised = kind === "EXPENDITURE" ? await tx.budgetLine.findMany({ where: { submissionId: submission.id, kind, capitalProjectId: null, budgetCode: { categoryId: null } } }) : [];
  const all = [...existing, ...existingUncategorised];
  const byId = new Map(all.map((l) => [l.id, l]));
  const keep = new Set<string>();
  let added = 0;
  let updated = 0;
  const oldValues: Record<string, unknown>[] = [];
  const newValues: Record<string, unknown>[] = [];

  for (const [index, l] of lines.entries()) {
    const data = {
      budgetCodeId: l.budgetCodeId,
      description: l.description ?? null,
      amount: l.amount,
      justification: l.justification ?? null,
      priorYearActual: kind === "REVENUE" ? l.priorYearActual ?? null : null,
      currentYearEstimate: kind === "REVENUE" ? l.currentYearEstimate ?? null : null,
      sortOrder: index,
      updatedById: actor.id,
    };
    const current = l.id ? byId.get(l.id) : undefined;
    if (current) {
      keep.add(current.id);
      const diff = changedFields(current as unknown as Record<string, unknown>, { budgetCodeId: data.budgetCodeId, description: data.description, amount: data.amount, justification: data.justification, priorYearActual: data.priorYearActual, currentYearEstimate: data.currentYearEstimate });
      if (diff) {
        await tx.budgetLine.update({ where: { id: current.id }, data });
        updated++;
        oldValues.push({ id: current.id, ...diff.oldValue });
        newValues.push({ id: current.id, ...diff.newValue });
      } else if (current.sortOrder !== index) {
        await tx.budgetLine.update({ where: { id: current.id }, data: { sortOrder: index } });
      }
    } else {
      const created = await tx.budgetLine.create({ data: { ...data, submissionId: submission.id, kind, createdById: actor.id } });
      keep.add(created.id);
      added++;
      newValues.push({ id: created.id, budgetCodeId: data.budgetCodeId, amount: data.amount });
    }
  }
  const toRemove = all.filter((l) => !keep.has(l.id));
  if (toRemove.length) {
    await tx.budgetLine.deleteMany({ where: { id: { in: toRemove.map((l) => l.id) } } });
    for (const r of toRemove) oldValues.push({ id: r.id, budgetCodeId: r.budgetCodeId, amount: r.amount, removed: true });
  }
  return { added, updated, removed: toRemove.length, oldValues, newValues, before: sum(all.map((l) => l.amount)), after: sum(lines.map((l) => l.amount)) };
}

export async function saveFormD(actor: Actor, submissionId: string, input: FormDInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const res = await replaceLines(tx, actor, s, "EXPENDITURE", input.lines);
    const categories = await getCategories();
    for (const cat of categories.filter((c) => c.kind === "EXPENDITURE" && !c.isCapital)) {
      await upsertNote(tx, actor, submissionId, "D", cat.id, input.categoryNotes[cat.id]);
    }
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormD",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: changeSummary("Form D recurrent expenditure", res.added, res.updated, res.removed, res.before, res.after),
      oldValue: res.oldValues,
      newValue: res.newValues,
    });
  });
}

export async function saveFormC(actor: Actor, submissionId: string, input: FormCInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const res = await replaceLines(tx, actor, s, "REVENUE", input.lines);
    const categories = await getCategories();
    for (const cat of categories.filter((c) => c.kind === "REVENUE")) {
      await upsertNote(tx, actor, submissionId, "C", cat.id, input.categoryNotes[cat.id]);
    }
    await upsertNote(tx, actor, submissionId, "C", "NO_REVENUE", input.noRevenue && input.lines.length === 0 ? "This agency does not collect revenue." : null);
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormC",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: changeSummary("Form C revenue estimates", res.added, res.updated, res.removed, res.before, res.after),
      oldValue: res.oldValues,
      newValue: res.newValues,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Form E — personnel
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormE(actor: Actor, submissionId: string, input: FormEInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const existing = await tx.personnelBudget.findMany({ where: { submissionId } });
    const byId = new Map(existing.map((p) => [p.id, p]));
    const keep = new Set<string>();
    let added = 0;
    let updated = 0;
    const oldValues: unknown[] = [];
    const newValues: unknown[] = [];
    for (const [index, row] of input.rows.entries()) {
      const data = {
        positionTitle: row.positionTitle,
        grade: row.grade ?? null,
        department: row.department ?? null,
        budgetCodeId: row.budgetCodeId || null,
        approvedEstablishment: row.approvedEstablishment,
        filledPositions: row.filledPositions,
        monthlyCost: row.monthlyCost,
        // Authoritative server-side calculation: filled × monthly × 12
        annualCost: calculatePersonnelCost(row.filledPositions, row.monthlyCost),
        remarks: row.remarks ?? null,
        sortOrder: index,
      };
      const current = row.id ? byId.get(row.id) : undefined;
      if (current) {
        keep.add(current.id);
        const diff = changedFields(current as unknown as Record<string, unknown>, data);
        if (diff) {
          await tx.personnelBudget.update({ where: { id: current.id }, data });
          if (Object.keys(diff.newValue).some((k) => k !== "sortOrder")) {
            updated++;
            oldValues.push({ id: current.id, ...diff.oldValue });
            newValues.push({ id: current.id, ...diff.newValue });
          }
        }
      } else {
        const created = await tx.personnelBudget.create({ data: { ...data, submissionId } });
        keep.add(created.id);
        added++;
        newValues.push({ id: created.id, ...data });
      }
    }
    const removed = existing.filter((p) => !keep.has(p.id));
    if (removed.length) {
      await tx.personnelBudget.deleteMany({ where: { id: { in: removed.map((p) => p.id) } } });
      oldValues.push(...removed.map((p) => ({ id: p.id, positionTitle: p.positionTitle, annualCost: p.annualCost, removed: true })));
    }
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormE",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: changeSummary(
        "Form E personnel",
        added,
        updated,
        removed.length,
        sum(existing.map((p) => p.annualCost)),
        sum(input.rows.map((r) => calculatePersonnelCost(r.filledPositions, r.monthlyCost))),
      ),
      oldValue: oldValues,
      newValue: newValues,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Form F — capital projects
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormF(actor: Actor, submissionId: string, input: FormFInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    await assertCodes(tx, input.rows.map((r) => r.budgetCodeId), "EXPENDITURE", s.budgetYear.year, { capital: true });
    const existingLines = await tx.budgetLine.findMany({
      where: { submissionId, OR: [{ capitalProjectId: { not: null } }, { budgetCode: { category: { isCapital: true } } }] },
      include: { capitalProject: true },
    });
    const lineById = new Map(existingLines.map((l) => [l.id, l]));
    const keep = new Set<string>();
    let added = 0;
    let updated = 0;
    const oldValues: unknown[] = [];
    const newValues: unknown[] = [];
    const seenProjects = new Set<string>();

    for (const [index, row] of input.rows.entries()) {
      const projectData = {
        projectCode: row.projectCode ?? null,
        name: row.name,
        location: row.location ?? null,
        description: row.description ?? null,
        justification: row.justification ?? null,
        totalCost: row.totalCost,
        spentToDate: row.spentToDate,
        fundingSourceId: row.fundingSourceId || null,
        fundingType: row.fundingType,
        projectType: row.projectType,
        isMultiYear: row.isMultiYear,
        startYear: row.startYear,
        expectedCompletionDate: row.expectedCompletionDate ? new Date(`${row.expectedCompletionDate}T00:00:00Z`) : null,
        status: row.status,
      };
      if (row.totalCost > 0 && row.spentToDate + row.allocation > row.totalCost + 1) {
        // Stored anyway; reported by validation (CAPITAL_ALLOCATION_WITHIN_COST).
      }
      const line = row.lineId ? lineById.get(row.lineId) : undefined;
      let projectId = line?.capitalProjectId ?? row.projectId ?? null;
      if (projectId) {
        const project = await tx.capitalProject.findUnique({ where: { id: projectId } });
        if (!project || project.mdaId !== s.mdaId) throw new NotFoundError("capital project");
        const diff = changedFields(project as unknown as Record<string, unknown>, projectData);
        if (diff) {
          await tx.capitalProject.update({ where: { id: projectId }, data: projectData });
          oldValues.push({ projectId, ...diff.oldValue });
          newValues.push({ projectId, ...diff.newValue });
        }
      } else {
        const project = await tx.capitalProject.create({ data: { ...projectData, mdaId: s.mdaId, startYear: row.startYear ?? s.budgetYear.year } });
        projectId = project.id;
        newValues.push({ projectId, ...projectData });
      }
      if (seenProjects.has(projectId)) throw new ValidationFailedError("A project can appear only once in Form F.", {}, [row.name]);
      seenProjects.add(projectId);

      const lineData = { budgetCodeId: row.budgetCodeId, capitalProjectId: projectId, amount: row.allocation, description: row.name, justification: row.justification ?? null, sortOrder: index, updatedById: actor.id };
      if (line) {
        keep.add(line.id);
        const diff = changedFields(line as unknown as Record<string, unknown>, { budgetCodeId: lineData.budgetCodeId, amount: lineData.amount, capitalProjectId: projectId });
        await tx.budgetLine.update({ where: { id: line.id }, data: lineData });
        if (diff) {
          updated++;
          oldValues.push({ lineId: line.id, ...diff.oldValue });
          newValues.push({ lineId: line.id, ...diff.newValue });
        }
      } else {
        const created = await tx.budgetLine.create({ data: { ...lineData, submissionId, kind: "EXPENDITURE", createdById: actor.id } });
        keep.add(created.id);
        added++;
      }
    }
    const removed = existingLines.filter((l) => !keep.has(l.id));
    if (removed.length) {
      await tx.budgetLine.deleteMany({ where: { id: { in: removed.map((l) => l.id) } } });
      for (const l of removed) {
        oldValues.push({ lineId: l.id, project: l.capitalProject?.name, amount: l.amount, removed: true });
        // A project proposed only in this draft is withdrawn (soft-deleted, never erased).
        if (l.capitalProjectId) {
          const otherLines = await tx.budgetLine.count({ where: { capitalProjectId: l.capitalProjectId } });
          if (otherLines === 0) await tx.capitalProject.update({ where: { id: l.capitalProjectId }, data: { deletedAt: new Date(), status: "CANCELLED" } });
        }
      }
    }
    await upsertNote(tx, actor, submissionId, "F", "NO_CAPITAL", input.noCapital && input.rows.length === 0 ? "No capital projects proposed." : null);
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormF",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: changeSummary("Form F capital projects", added, updated, removed.length, sum(existingLines.map((l) => l.amount)), sum(input.rows.map((r) => r.allocation))),
      oldValue: oldValues,
      newValue: newValues,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Form G — procurement plan
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormG(actor: Actor, submissionId: string, input: FormGInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const existing = await tx.procurementPlan.findMany({ where: { submissionId } });
    const byId = new Map(existing.map((p) => [p.id, p]));
    const keep = new Set<string>();
    let added = 0;
    let updated = 0;
    const oldValues: unknown[] = [];
    const newValues: unknown[] = [];
    const projectIds = new Set(
      (await tx.budgetLine.findMany({ where: { submissionId, capitalProjectId: { not: null } }, select: { capitalProjectId: true } })).map((l) => l.capitalProjectId!),
    );
    for (const [index, row] of input.rows.entries()) {
      if (row.capitalProjectId && !projectIds.has(row.capitalProjectId)) {
        throw new ValidationFailedError("Procurement items can only be linked to projects in Form F.", {}, [row.itemDescription]);
      }
      const data = {
        itemDescription: row.itemDescription,
        estimatedCost: row.estimatedCost,
        procurementMethodId: row.procurementMethodId || null,
        quarter: row.quarter,
        responsibleDepartment: row.responsibleDepartment ?? null,
        budgetCategoryId: row.capitalProjectId ? null : row.budgetCategoryId || null,
        capitalProjectId: row.capitalProjectId || null,
        remarks: row.remarks ?? null,
        sortOrder: index,
      };
      const current = row.id ? byId.get(row.id) : undefined;
      if (current) {
        keep.add(current.id);
        const diff = changedFields(current as unknown as Record<string, unknown>, data);
        if (diff) {
          await tx.procurementPlan.update({ where: { id: current.id }, data });
          if (Object.keys(diff.newValue).some((k) => k !== "sortOrder")) {
            updated++;
            oldValues.push({ id: current.id, ...diff.oldValue });
            newValues.push({ id: current.id, ...diff.newValue });
          }
        }
      } else {
        const created = await tx.procurementPlan.create({ data: { ...data, submissionId } });
        keep.add(created.id);
        added++;
        newValues.push({ id: created.id, ...data });
      }
    }
    const removed = existing.filter((p) => !keep.has(p.id));
    if (removed.length) {
      await tx.procurementPlan.deleteMany({ where: { id: { in: removed.map((p) => p.id) } } });
      oldValues.push(...removed.map((p) => ({ id: p.id, itemDescription: p.itemDescription, estimatedCost: p.estimatedCost, removed: true })));
    }
    await upsertNote(tx, actor, submissionId, "G", "NO_PROCUREMENT", input.noProcurement && input.rows.length === 0 ? "No procurement planned." : null);
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormG",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: changeSummary("Form G procurement plan", added, updated, removed.length, sum(existing.map((p) => p.estimatedCost)), sum(input.rows.map((r) => r.estimatedCost))),
      oldValue: oldValues,
      newValue: newValues,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Form H — cash flow
// ─────────────────────────────────────────────────────────────────────────────

export async function saveFormH(actor: Actor, submissionId: string, input: FormHInput, revision?: string) {
  return mutate(actor, submissionId, revision, async (tx, s) => {
    const existing = await tx.cashFlowForecast.findMany({ where: { submissionId } });
    const quarters = new Set(input.rows.map((r) => r.quarter));
    if (quarters.size !== 4) throw new ValidationFailedError("Enter each quarter exactly once.");
    for (const row of input.rows) {
      await tx.cashFlowForecast.upsert({
        where: { submissionId_quarter: { submissionId, quarter: row.quarter } },
        create: { submissionId, quarter: row.quarter, amount: row.amount, remarks: row.remarks ?? null },
        update: { amount: row.amount, remarks: row.remarks ?? null },
      });
    }
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "FormH",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: `Form H cash flow: total ${sum(existing.map((c) => c.amount)).toLocaleString("en-US")} → ${sum(input.rows.map((r) => r.amount)).toLocaleString("en-US")}`,
      oldValue: existing.map((c) => ({ quarter: c.quarter, amount: c.amount })),
      newValue: input.rows.map((r) => ({ quarter: r.quarter, amount: r.amount })),
    });
  });
}

/** Fill Form H by spreading the total budget evenly across quarters. */
export async function distributeCashFlowEvenly(actor: Actor, submissionId: string, revision?: string) {
  const bundle = await loadSubmissionBundle(prisma, submissionId);
  const split = spreadAcrossQuarters(bundle.summary.totals.expenditure);
  return saveFormH(
    actor,
    submissionId,
    { rows: (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({ quarter: q, amount: split[q], remarks: bundle.cashFlow.find((c) => c.quarter === q)?.remarks ?? null })) },
    revision,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual line edits (Budget Items page)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateLine(actor: Actor, input: { lineId: string; amount?: number; description?: string | null; justification?: string | null }) {
  const line = await prisma.budgetLine.findUnique({ where: { id: input.lineId }, select: { submissionId: true } });
  if (!line) throw new NotFoundError("budget line");
  return mutate(actor, line.submissionId, null, async (tx, s) => {
    const current = await tx.budgetLine.findUniqueOrThrow({ where: { id: input.lineId }, include: { budgetCode: true } });
    const data: { amount?: number; description?: string | null; justification?: string | null } = {};
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.description !== undefined) data.description = input.description;
    if (input.justification !== undefined) data.justification = input.justification;
    const diff = changedFields(current as unknown as Record<string, unknown>, data);
    if (!diff) return current;
    const updated = await tx.budgetLine.update({ where: { id: input.lineId }, data: { ...data, updatedById: actor.id } });
    await audit(tx, actor, {
      action: "UPDATE",
      entityType: "BudgetLine",
      entityId: input.lineId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: `Line ${current.budgetCode.code} updated`,
      ...diff,
    });
    return updated;
  });
}

export async function bulkUpdateLines(actor: Actor, input: { lineIds: string[]; mode: "SET" | "PERCENT" | "ADD"; value: number; reason?: string | null }) {
  const lines = await prisma.budgetLine.findMany({ where: { id: { in: input.lineIds } }, select: { id: true, submissionId: true } });
  const bySubmission = new Map<string, string[]>();
  for (const l of lines) bySubmission.set(l.submissionId, [...(bySubmission.get(l.submissionId) ?? []), l.id]);
  let count = 0;
  for (const [submissionId, ids] of bySubmission) {
    await mutate(actor, submissionId, null, async (tx, s) => {
      const current = await tx.budgetLine.findMany({ where: { id: { in: ids } } });
      const oldValues: unknown[] = [];
      const newValues: unknown[] = [];
      for (const l of current) {
        const before = toAmount(l.amount);
        let after = before;
        if (input.mode === "SET") after = input.value;
        else if (input.mode === "ADD") after = before + input.value;
        else after = before * (1 + input.value / 100);
        after = Math.max(0, toAmount(after));
        if (after !== before) {
          await tx.budgetLine.update({ where: { id: l.id }, data: { amount: after, updatedById: actor.id } });
          oldValues.push({ id: l.id, amount: before });
          newValues.push({ id: l.id, amount: after });
          count++;
        }
      }
      if (newValues.length) {
        await audit(tx, actor, {
          action: "UPDATE",
          entityType: "BudgetLine",
          entityId: submissionId,
          mdaId: s.mdaId,
          budgetYearId: s.budgetYearId,
          summary: `Bulk edit (${input.mode} ${input.value}) of ${newValues.length} line(s)`,
          oldValue: oldValues,
          newValue: newValues,
          reason: input.reason ?? null,
        });
      }
    });
  }
  return { updated: count };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation, versions, certification
// ─────────────────────────────────────────────────────────────────────────────

export async function runValidation(actor: Actor, submissionId: string) {
  await getSubmissionHeader(actor, submissionId);
  return prisma.$transaction(async (tx) => {
    const bundle = await loadSubmissionBundle(tx, submissionId, { locale: "en" });
    await storeValidationResults(tx, submissionId, bundle.checks);
    await audit(tx, actor, {
      action: "VALIDATE",
      entityType: "BudgetSubmission",
      entityId: submissionId,
      mdaId: bundle.submission.mdaId,
      budgetYearId: bundle.submission.budgetYearId,
      summary: `Validation: ${bundle.tally.passed} passed, ${bundle.tally.warnings} warning(s), ${bundle.tally.errors} error(s)`,
    });
    return bundle.tally;
  });
}

export async function saveCheckpoint(actor: Actor, submissionId: string, reason: string | null) {
  const header = await getSubmissionHeader(actor, submissionId);
  if (!canEditSubmission(actor, header)) throw new AuthorizationError("Only the agency's budget staff can save versions of a draft.");
  return prisma.$transaction(async (tx) => {
    const version = await createVersion(tx, actor, submissionId, { reason });
    await audit(tx, actor, { action: "CREATE", entityType: "BudgetVersion", entityId: version.id, mdaId: header.mdaId, budgetYearId: header.budgetYearId, summary: `Saved ${version.label}`, reason });
    return version;
  });
}

/** Restore the form data of a draft from an earlier version (the restore itself creates a new version). */
export async function restoreVersion(actor: Actor, submissionId: string, versionId: string, reason: string) {
  if (!can(actor, "budget.version.restore")) throw new AuthorizationError("You do not have permission to restore versions.");
  const version = await prisma.budgetVersion.findUnique({ where: { id: versionId } });
  if (!version || version.submissionId !== submissionId) throw new NotFoundError("version");
  const snap = version.snapshot as unknown as import("./submission-data").SubmissionSnapshot;
  return mutate(actor, submissionId, null, async (tx, s) => {
    const before = await createVersion(tx, actor, submissionId, { reason: `Automatic backup before restoring ${version.label}` });
    await tx.budgetLine.deleteMany({ where: { submissionId } });
    await tx.personnelBudget.deleteMany({ where: { submissionId } });
    await tx.procurementPlan.deleteMany({ where: { submissionId } });
    await tx.submissionNote.deleteMany({ where: { submissionId } });
    await tx.budgetSubmission.update({ where: { id: submissionId }, data: snap.submission.formA });
    let order = 0;
    for (const l of snap.expenditureLines) {
      await tx.budgetLine.create({ data: { submissionId, kind: "EXPENDITURE", budgetCodeId: l.budgetCodeId, description: l.description, amount: l.amount, justification: l.justification, sortOrder: order++, createdById: actor.id, sourceRef: `Restored from ${version.label}` } });
    }
    for (const l of snap.revenueLines) {
      await tx.budgetLine.create({
        data: { submissionId, kind: "REVENUE", budgetCodeId: l.budgetCodeId, description: l.description, amount: l.amount, priorYearActual: l.priorYearActual, currentYearEstimate: l.currentYearEstimate, justification: l.justification, sortOrder: order++, createdById: actor.id, sourceRef: `Restored from ${version.label}` },
      });
    }
    for (const c of snap.capital) {
      await tx.budgetLine.create({ data: { submissionId, kind: "EXPENDITURE", budgetCodeId: c.budgetCodeId, capitalProjectId: c.projectId, description: c.name, amount: c.allocation, sortOrder: order++, createdById: actor.id, sourceRef: `Restored from ${version.label}` } });
      if (c.projectId) await tx.capitalProject.update({ where: { id: c.projectId }, data: { deletedAt: null, totalCost: c.totalCost, spentToDate: c.spentToDate, status: c.status as never } });
    }
    for (const [i, p] of snap.personnel.entries()) {
      await tx.personnelBudget.create({ data: { submissionId, positionTitle: p.positionTitle, grade: p.grade, department: p.department, budgetCodeId: p.budgetCodeId, approvedEstablishment: p.approvedEstablishment, filledPositions: p.filledPositions, monthlyCost: p.monthlyCost, annualCost: calculatePersonnelCost(p.filledPositions, p.monthlyCost), remarks: p.remarks, sortOrder: i } });
    }
    for (const [i, p] of snap.procurement.entries()) {
      await tx.procurementPlan.create({ data: { submissionId, itemDescription: p.itemDescription, estimatedCost: p.estimatedCost, procurementMethodId: p.procurementMethodId, quarter: p.quarter, responsibleDepartment: p.responsibleDepartment, budgetCategoryId: p.budgetCategoryId, capitalProjectId: p.capitalProjectId, remarks: p.remarks, sortOrder: i } });
    }
    for (const c of snap.cashFlow) {
      await tx.cashFlowForecast.upsert({ where: { submissionId_quarter: { submissionId, quarter: c.quarter } }, create: { submissionId, quarter: c.quarter, amount: c.amount, remarks: c.remarks }, update: { amount: c.amount, remarks: c.remarks } });
    }
    for (const [key, text] of Object.entries(snap.notes)) {
      const [form, ...rest] = key.split(":");
      await tx.submissionNote.create({ data: { submissionId, form: form as never, key: rest.join(":"), text, updatedById: actor.id } });
    }
    await audit(tx, actor, {
      action: "RESTORE",
      entityType: "BudgetSubmission",
      entityId: submissionId,
      mdaId: s.mdaId,
      budgetYearId: s.budgetYearId,
      summary: `Restored ${version.label} (backup saved as ${before.label})`,
      reason,
    });
  });
}

export type CertificationRole = "PREPARED" | "REVIEWED" | "APPROVED" | "HR";

const CERT_PERMISSION = {
  PREPARED: "budget.certify.prepare",
  REVIEWED: "budget.certify.review",
  APPROVED: "budget.certify.approve",
  HR: "budget.certify.hr",
} as const;

export function signatureText(actor: Actor, role: CertificationRole, at: Date) {
  const ref = Buffer.from(`${actor.id}:${role}:${at.getTime()}`).toString("base64url").slice(-10).toUpperCase();
  return `Signed electronically by ${actor.name} <${actor.email}> on ${at.toISOString()} (ref ${ref})`;
}

export async function signCertification(actor: Actor, submissionId: string, role: CertificationRole, title?: string | null, client?: Tx) {
  if (!can(actor, CERT_PERMISSION[role])) throw new AuthorizationError("You are not authorised to sign this part of the certification.");
  const run = async (tx: Tx) => {
    const s = await tx.budgetSubmission.findUnique({ where: { id: submissionId } });
    if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
    if (!isAgencyMember(actor, s.mdaId) && !actor.allMdas) throw new AuthorizationError("Only the agency's officials can sign its certification.");
    if (s.isLocked || !isEditableStatus(s.status)) throw new BusinessRuleError("The certification can only be signed while the budget is a draft or returned for correction.");
    const at = new Date();
    const fields =
      role === "PREPARED"
        ? { preparedByName: actor.name, preparedByTitle: title ?? actor.jobTitle, preparedById: actor.id, preparedAt: at, preparedSignature: signatureText(actor, role, at) }
        : role === "REVIEWED"
          ? { reviewedByName: actor.name, reviewedByTitle: title ?? actor.jobTitle, reviewedById: actor.id, reviewedAt: at, reviewedSignature: signatureText(actor, role, at) }
          : role === "APPROVED"
            ? { approvedByName: actor.name, approvedByTitle: title ?? actor.jobTitle, approvedById: actor.id, approvedAt: at, approvedSignature: signatureText(actor, role, at) }
            : { hrCertifiedByName: actor.name, hrCertifiedById: actor.id, hrCertifiedAt: at };
    await tx.certification.upsert({ where: { submissionId }, create: { submissionId, ...fields }, update: fields });
    await audit(tx, actor, { action: "CERTIFY", entityType: "Certification", entityId: submissionId, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `${role.toLowerCase()} certification signed`, newValue: fields });
  };
  return client ? run(client) : prisma.$transaction(run);
}

export async function revokeCertification(actor: Actor, submissionId: string, role: CertificationRole) {
  if (!can(actor, CERT_PERMISSION[role])) throw new AuthorizationError();
  return prisma.$transaction(async (tx) => {
    const s = await tx.budgetSubmission.findUnique({ where: { id: submissionId } });
    if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
    if (s.isLocked || !isEditableStatus(s.status)) throw new BusinessRuleError("The certification can only be changed while the budget is a draft.");
    const cleared =
      role === "PREPARED"
        ? { preparedByName: null, preparedByTitle: null, preparedById: null, preparedAt: null, preparedSignature: null }
        : role === "REVIEWED"
          ? { reviewedByName: null, reviewedByTitle: null, reviewedById: null, reviewedAt: null, reviewedSignature: null }
          : role === "APPROVED"
            ? { approvedByName: null, approvedByTitle: null, approvedById: null, approvedAt: null, approvedSignature: null }
            : { hrCertifiedByName: null, hrCertifiedById: null, hrCertifiedAt: null };
    await tx.certification.updateMany({ where: { submissionId }, data: cleared });
    await audit(tx, actor, { action: "UPDATE", entityType: "Certification", entityId: submissionId, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `${role.toLowerCase()} certification withdrawn` });
  });
}

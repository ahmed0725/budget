/**
 * Budget execution: allocations from published budgets compared with monthly actuals,
 * revenue collections and the commitments register.
 *
 * Available balance = revised allocation − actual expenditure − open commitments
 * (committed + obligated). Commitments cannot exceed the available balance of their
 * allocation; paying a commitment records the payment as actual expenditure.
 */
import type { CommitmentStatus, Prisma } from "@/generated/prisma/client";
import { canAccessMda, can, mdaScope, type Actor } from "@/lib/auth/actor";
import { calculateAvailableBalance, calculateExecutionRate, calculateRevenueCollectionRate, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import { audit } from "./audit";

const n = (v: unknown) => toAmount(Number(v ?? 0));

function needView(actor: Actor) {
  if (!can(actor, "execution.view")) throw new AuthorizationError();
}

async function executionYear(year: number) {
  const y = await prisma.budgetYear.findUnique({ where: { year } });
  if (!y) throw new NotFoundError(`budget year ${year}`);
  return y;
}

function scopeWhere(actor: Actor, mdaId?: string) {
  const scope = mdaScope(actor);
  if (mdaId) {
    if (!canAccessMda(actor, mdaId)) throw new AuthorizationError("You can only view execution data of your own MDA.");
    return { mdaId };
  }
  return scope ? { mdaId: scope } : {};
}

export interface ExecutionLine {
  mdaId: string;
  mdaCode: string;
  mdaName: string;
  codeId: string;
  code: string;
  codeName: string;
  original: number;
  revised: number;
  actual: number;
  committed: number;
  obligated: number;
  available: number;
  rate: number | null;
  months: number[];
}

/** Line-level execution (MDA × code) with monthly actuals. */
export async function executionLines(actor: Actor, input: { year: number; kind: "EXPENDITURE" | "REVENUE"; mdaId?: string; sectorId?: string; q?: string }): Promise<ExecutionLine[]> {
  needView(actor);
  const year = await executionYear(input.year);
  const where = {
    budgetYearId: year.id,
    ...scopeWhere(actor, input.mdaId),
    ...(input.sectorId ? { mda: { sectorId: input.sectorId } } : {}),
  };
  const [allocations, actuals, commitments] = await Promise.all([
    prisma.budgetAllocation.findMany({ where: { ...where, kind: input.kind }, include: { mda: { select: { code: true, name: true, nameEn: true } }, budgetCode: { select: { code: true, name: true, nameEn: true } } } }),
    input.kind === "EXPENDITURE"
      ? prisma.expenditureExecution.findMany({ where, select: { mdaId: true, budgetCodeId: true, month: true, actualAmount: true, mda: { select: { code: true, name: true, nameEn: true } }, budgetCode: { select: { code: true, name: true, nameEn: true } } } })
      : prisma.revenueExecution.findMany({ where, select: { mdaId: true, budgetCodeId: true, month: true, actualAmount: true, mda: { select: { code: true, name: true, nameEn: true } }, budgetCode: { select: { code: true, name: true, nameEn: true } } } }),
    input.kind === "EXPENDITURE" ? prisma.commitment.findMany({ where: { ...where, status: { in: ["COMMITTED", "OBLIGATED"] } }, select: { mdaId: true, budgetCodeId: true, amount: true, status: true } }) : Promise.resolve([]),
  ]);
  const lines = new Map<string, ExecutionLine>();
  const line = (mdaId: string, codeId: string, mda: { code: string; name: string; nameEn: string | null }, code: { code: string; name: string; nameEn: string | null }) => {
    const key = `${mdaId}|${codeId}`;
    let l = lines.get(key);
    if (!l) {
      l = { mdaId, mdaCode: mda.code, mdaName: actor.locale === "en" && mda.nameEn ? mda.nameEn : mda.name, codeId, code: code.code, codeName: actor.locale === "en" && code.nameEn ? code.nameEn : code.name, original: 0, revised: 0, actual: 0, committed: 0, obligated: 0, available: 0, rate: null, months: Array(12).fill(0) };
      lines.set(key, l);
    }
    return l;
  };
  for (const a of allocations) {
    const l = line(a.mdaId, a.budgetCodeId, a.mda, a.budgetCode);
    l.original = toAmount(l.original + n(a.originalAmount));
    l.revised = toAmount(l.revised + n(a.revisedAmount));
  }
  for (const x of actuals) {
    const l = line(x.mdaId, x.budgetCodeId, x.mda, x.budgetCode);
    l.months[x.month - 1] = toAmount(l.months[x.month - 1] + n(x.actualAmount));
    l.actual = toAmount(l.actual + n(x.actualAmount));
  }
  for (const c of commitments) {
    const l = lines.get(`${c.mdaId}|${c.budgetCodeId}`);
    if (!l) continue;
    l.committed = toAmount(l.committed + n(c.amount));
    if (c.status === "OBLIGATED") l.obligated = toAmount(l.obligated + n(c.amount));
  }
  const q = input.q?.toLowerCase();
  return [...lines.values()]
    .map((l) => ({
      ...l,
      available: input.kind === "EXPENDITURE" ? calculateAvailableBalance(l.revised, l.actual, l.committed) : toAmount(l.revised - l.actual),
      rate: input.kind === "EXPENDITURE" ? calculateExecutionRate(l.actual, l.revised) : calculateRevenueCollectionRate(l.actual, l.revised),
    }))
    .filter((l) => !q || l.code.startsWith(q) || l.codeName.toLowerCase().includes(q) || l.mdaCode.startsWith(q) || l.mdaName.toLowerCase().includes(q))
    .sort((a, b) => a.mdaCode.localeCompare(b.mdaCode) || a.code.localeCompare(b.code));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording actuals
// ─────────────────────────────────────────────────────────────────────────────

function needManage(actor: Actor, mdaId: string) {
  if (!can(actor, "execution.manage")) throw new AuthorizationError("You do not have permission to record execution figures.");
  if (!canAccessMda(actor, mdaId)) throw new AuthorizationError("You can only record figures for your own MDA.");
}

function assertExecuting(year: { year: number; status: string }) {
  if (year.status === "CLOSED") throw new BusinessRuleError(`Budget year ${year.year} is closed; execution figures can no longer be changed.`);
  if (!["ACTIVE", "PUBLISHED"].includes(year.status)) throw new BusinessRuleError(`Budget year ${year.year} is not in execution yet (status: ${year.status.toLowerCase()}).`);
}

export async function recordActual(actor: Actor, input: { year: number; kind: "EXPENDITURE" | "REVENUE"; mdaId: string; codeId: string; month: number; actual: number; planned: number | null; remarks: string | null }) {
  needManage(actor, input.mdaId);
  const year = await executionYear(input.year);
  assertExecuting(year);
  const code = await prisma.budgetCode.findUnique({ where: { id: input.codeId } });
  if (!code || code.kind !== input.kind) throw new ValidationFailedError(`Select a ${input.kind.toLowerCase()} code.`, { codeId: ["Wrong code type"] });
  const key = { budgetYearId_mdaId_budgetCodeId_month: { budgetYearId: year.id, mdaId: input.mdaId, budgetCodeId: input.codeId, month: input.month } };
  return prisma.$transaction(async (tx) => {
    if (input.kind === "EXPENDITURE") {
      const before = await tx.expenditureExecution.findUnique({ where: key });
      const row = await tx.expenditureExecution.upsert({
        where: key,
        create: { budgetYearId: year.id, mdaId: input.mdaId, budgetCodeId: input.codeId, month: input.month, actualAmount: input.actual, plannedAmount: input.planned ?? 0, remarks: input.remarks, source: "MANUAL", enteredById: actor.id },
        update: { actualAmount: input.actual, ...(input.planned !== null ? { plannedAmount: input.planned } : {}), remarks: input.remarks, source: "MANUAL", enteredById: actor.id },
      });
      await audit(tx, actor, { action: before ? "UPDATE" : "CREATE", entityType: "ExpenditureExecution", entityId: row.id, mdaId: input.mdaId, budgetYearId: year.id, summary: `Actual expenditure ${code.code} for ${input.year}-${String(input.month).padStart(2, "0")}`, oldValue: before ? { actual: before.actualAmount, planned: before.plannedAmount } : undefined, newValue: { actual: input.actual, planned: input.planned } });
      return row.id;
    }
    const before = await tx.revenueExecution.findUnique({ where: key });
    const row = await tx.revenueExecution.upsert({
      where: key,
      create: { budgetYearId: year.id, mdaId: input.mdaId, budgetCodeId: input.codeId, month: input.month, actualAmount: input.actual, targetAmount: input.planned ?? 0, remarks: input.remarks, source: "MANUAL", enteredById: actor.id },
      update: { actualAmount: input.actual, ...(input.planned !== null ? { targetAmount: input.planned } : {}), remarks: input.remarks, source: "MANUAL", enteredById: actor.id },
    });
    await audit(tx, actor, { action: before ? "UPDATE" : "CREATE", entityType: "RevenueExecution", entityId: row.id, mdaId: input.mdaId, budgetYearId: year.id, summary: `Revenue collected ${code.code} for ${input.year}-${String(input.month).padStart(2, "0")}`, oldValue: before ? { actual: before.actualAmount, target: before.targetAmount } : undefined, newValue: { actual: input.actual, target: input.planned } });
    return row.id;
  });
}

/** Codes an MDA can record against (its allocations for the year), for pickers. */
export async function allocationOptions(actor: Actor, year: number, mdaId: string, kind: "EXPENDITURE" | "REVENUE") {
  needView(actor);
  if (!canAccessMda(actor, mdaId)) throw new AuthorizationError();
  const lines = await executionLines(actor, { year, kind, mdaId });
  return lines.filter((l) => l.revised > 0).map((l) => ({ codeId: l.codeId, code: l.code, name: l.codeName, available: l.available, revised: l.revised, actual: l.actual }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Commitments
// ─────────────────────────────────────────────────────────────────────────────

export async function listCommitments(actor: Actor, f: { year: number; mdaId?: string; status?: string; q?: string; page: number; pageSize: number }) {
  needView(actor);
  const year = await executionYear(f.year);
  const where: Prisma.CommitmentWhereInput = {
    budgetYearId: year.id,
    ...scopeWhere(actor, f.mdaId),
    ...(f.status && ["COMMITTED", "OBLIGATED", "LIQUIDATED", "CANCELLED"].includes(f.status) ? { status: f.status as CommitmentStatus } : {}),
    ...(f.q ? { OR: [{ reference: { contains: f.q } }, { description: { contains: f.q } }, { supplier: { contains: f.q } }] } : {}),
  };
  const [total, rows, sums] = await Promise.all([
    prisma.commitment.count({ where }),
    prisma.commitment.findMany({ where, orderBy: [{ commitmentDate: "desc" }, { reference: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { mda: { select: { code: true, name: true, nameEn: true } }, budgetCode: { select: { code: true, name: true, nameEn: true } } } }),
    prisma.commitment.groupBy({ by: ["status"], where: { budgetYearId: year.id, ...scopeWhere(actor, f.mdaId) }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return { total, rows, byStatus: Object.fromEntries(sums.map((s) => [s.status, { amount: n(s._sum.amount), count: s._count._all }])) as Partial<Record<CommitmentStatus, { amount: number; count: number }>> };
}

async function availableFor(tx: Prisma.TransactionClient, budgetYearId: string, mdaId: string, codeId: string, excludeId?: string) {
  const [alloc, actual, open] = await Promise.all([
    tx.budgetAllocation.aggregate({ where: { budgetYearId, mdaId, budgetCodeId: codeId, kind: "EXPENDITURE" }, _sum: { revisedAmount: true }, _count: { _all: true } }),
    tx.expenditureExecution.aggregate({ where: { budgetYearId, mdaId, budgetCodeId: codeId }, _sum: { actualAmount: true } }),
    tx.commitment.aggregate({ where: { budgetYearId, mdaId, budgetCodeId: codeId, status: { in: ["COMMITTED", "OBLIGATED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { amount: true } }),
  ]);
  return { hasAllocation: alloc._count._all > 0, revised: n(alloc._sum.revisedAmount), actual: n(actual._sum.actualAmount), committed: n(open._sum.amount), available: calculateAvailableBalance(n(alloc._sum.revisedAmount), n(actual._sum.actualAmount), n(open._sum.amount)) };
}

export async function createCommitment(actor: Actor, input: { year: number; mdaId: string; codeId: string; reference: string; description: string; supplier: string | null; amount: number; commitmentDate: string }) {
  needManage(actor, input.mdaId);
  const year = await executionYear(input.year);
  assertExecuting(year);
  const date = new Date(`${input.commitmentDate}T00:00:00Z`);
  if (date.getUTCFullYear() !== input.year) throw new ValidationFailedError(`The commitment date must fall within ${input.year}.`, { commitmentDate: ["Outside the budget year"] });
  return prisma.$transaction(async (tx) => {
    if (await tx.commitment.findUnique({ where: { budgetYearId_reference: { budgetYearId: year.id, reference: input.reference } } })) {
      throw new ValidationFailedError(`Reference ${input.reference} is already used in ${input.year}.`, { reference: ["Already used"] });
    }
    const bal = await availableFor(tx, year.id, input.mdaId, input.codeId);
    if (!bal.hasAllocation) throw new BusinessRuleError("This MDA has no approved allocation for the selected code. Commitments can only be made against published budget lines.");
    if (input.amount > bal.available) {
      throw new BusinessRuleError(`The commitment of ${input.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} exceeds the available balance of ${bal.available.toLocaleString("en-US", { minimumFractionDigits: 2 })} (allocation ${bal.revised.toLocaleString("en-US")} − spent ${bal.actual.toLocaleString("en-US")} − committed ${bal.committed.toLocaleString("en-US")}). Reduce the amount or request a budget revision.`);
    }
    const c = await tx.commitment.create({ data: { budgetYearId: year.id, mdaId: input.mdaId, budgetCodeId: input.codeId, reference: input.reference, description: input.description, supplier: input.supplier, amount: input.amount, commitmentDate: date, status: "COMMITTED", source: "MANUAL", createdById: actor.id } });
    await audit(tx, actor, { action: "CREATE", entityType: "Commitment", entityId: c.id, mdaId: input.mdaId, budgetYearId: year.id, summary: `Commitment ${input.reference}: ${input.amount.toLocaleString("en-US")}`, newValue: input });
    return c;
  });
}

const COMMITMENT_FLOW: Record<"OBLIGATE" | "PAY" | "CANCEL", { from: CommitmentStatus[]; to: CommitmentStatus }> = {
  OBLIGATE: { from: ["COMMITTED"], to: "OBLIGATED" },
  PAY: { from: ["COMMITTED", "OBLIGATED"], to: "LIQUIDATED" },
  CANCEL: { from: ["COMMITTED", "OBLIGATED"], to: "CANCELLED" },
};

export async function changeCommitmentStatus(actor: Actor, id: string, action: "OBLIGATE" | "PAY" | "CANCEL", reason: string | null) {
  const c = await prisma.commitment.findUnique({ where: { id }, include: { budgetYear: true, budgetCode: { select: { code: true } } } });
  if (!c) throw new NotFoundError("commitment");
  needManage(actor, c.mdaId);
  assertExecuting(c.budgetYear);
  const flow = COMMITMENT_FLOW[action];
  if (!flow.from.includes(c.status)) throw new BusinessRuleError(`A ${c.status.toLowerCase()} commitment cannot be ${action === "PAY" ? "paid" : action === "OBLIGATE" ? "obligated" : "cancelled"}.`);
  if (action === "CANCEL" && !reason?.trim()) throw new ValidationFailedError("Give a reason for cancelling the commitment.", { reason: ["Required"] });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.commitment.update({
      where: { id },
      data: { status: flow.to, ...(action === "OBLIGATE" ? { obligatedAt: now } : action === "PAY" ? { liquidatedAt: now } : { cancelledAt: now, cancelReason: reason }) },
    });
    if (action === "PAY") {
      // The payment becomes actual expenditure of the current month (or December for past years).
      const month = now.getUTCFullYear() === c.budgetYear.year ? now.getUTCMonth() + 1 : 12;
      const key = { budgetYearId_mdaId_budgetCodeId_month: { budgetYearId: c.budgetYearId, mdaId: c.mdaId, budgetCodeId: c.budgetCodeId, month } };
      const existing = await tx.expenditureExecution.findUnique({ where: key });
      await tx.expenditureExecution.upsert({
        where: key,
        create: { budgetYearId: c.budgetYearId, mdaId: c.mdaId, budgetCodeId: c.budgetCodeId, month, actualAmount: c.amount, remarks: `Payment of commitment ${c.reference}`, source: "SYSTEM", enteredById: actor.id },
        update: { actualAmount: toAmount(n(existing?.actualAmount) + n(c.amount)), remarks: [existing?.remarks, `Payment of commitment ${c.reference}`].filter(Boolean).join("; ").slice(0, 500), enteredById: actor.id },
      });
    }
    await audit(tx, actor, { action: action === "CANCEL" ? "DELETE" : "UPDATE", entityType: "Commitment", entityId: id, mdaId: c.mdaId, budgetYearId: c.budgetYearId, summary: `Commitment ${c.reference}: ${c.status} → ${flow.to}`, oldValue: { status: c.status }, newValue: { status: flow.to }, reason });
  });
}

export async function commitmentBalance(actor: Actor, year: number, mdaId: string, codeId: string) {
  needView(actor);
  if (!canAccessMda(actor, mdaId)) throw new AuthorizationError();
  const y = await executionYear(year);
  return prisma.$transaction((tx) => availableFor(tx, y.id, mdaId, codeId));
}

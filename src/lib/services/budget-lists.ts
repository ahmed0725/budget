/**
 * Cross-agency views of budget data for a year (Budget → Items, Revenue, Expenditure,
 * Personnel, Capital projects, Procurement, Cash flow). Each MDA contributes its
 * effective budget (latest approved, else its latest proposal); the actor's MDA scope
 * and approved-only restriction apply.
 */
import type { Prisma, ProjectStatus } from "@/generated/prisma/client";
import { canAccessMda, mdaScope, type Actor } from "@/lib/auth/actor";
import { calculateChange, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";
import { effectiveSubmissions, type Dataset } from "./analytics";
import { canEditSubmission } from "./submissions";

export interface ListFilters {
  year: number;
  dataset?: Dataset;
  mdaId?: string;
  sectorId?: string;
}

async function submissionMap(actor: Actor, f: ListFilters) {
  const subs = await effectiveSubmissions(actor, f.year, { dataset: f.dataset, mdaId: f.mdaId, sectorId: f.sectorId });
  return subs;
}

const ITEM_SORTS: Record<string, (dir: "asc" | "desc") => Prisma.BudgetLineOrderByWithRelationInput[]> = {
  mda: (dir) => [{ submission: { mda: { code: dir } } }, { budgetCode: { code: "asc" } }],
  code: (dir) => [{ budgetCode: { code: dir } }],
  amount: (dir) => [{ amount: dir }],
  category: (dir) => [{ budgetCode: { category: { sortOrder: dir } } }, { budgetCode: { code: "asc" } }],
};

export async function listBudgetItems(actor: Actor, f: ListFilters & { kind?: "REVENUE" | "EXPENDITURE"; categoryId?: string; q?: string; page: number; pageSize: number; sort?: string | null }) {
  const subs = await submissionMap(actor, f);
  const where: Prisma.BudgetLineWhereInput = {
    submissionId: { in: subs.map((s) => s.id) },
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.categoryId ? { budgetCode: { categoryId: f.categoryId } } : {}),
    ...(f.q ? { OR: [{ budgetCode: { code: { startsWith: f.q } } }, { budgetCode: { name: { contains: f.q } } }, { budgetCode: { nameEn: { contains: f.q } } }, { description: { contains: f.q } }] } : {}),
  };
  const [key, dir] = (f.sort ?? "mda.asc").split(".") as [string, "asc" | "desc"];
  const [total, sums, lines] = await Promise.all([
    prisma.budgetLine.count({ where }),
    prisma.budgetLine.groupBy({ by: ["kind"], where, _sum: { amount: true } }),
    prisma.budgetLine.findMany({
      where,
      orderBy: (ITEM_SORTS[key] ?? ITEM_SORTS.mda)(dir === "desc" ? "desc" : "asc"),
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: {
        budgetCode: { select: { code: true, name: true, nameEn: true, category: { select: { name: true, nameSo: true } } } },
        capitalProject: { select: { name: true } },
        submission: { select: { id: true, mdaId: true, status: true, isLocked: true, mda: { select: { code: true, name: true, nameEn: true } } } },
      },
    }),
  ]);
  // Prior-year approved amounts for the same MDA and code.
  const prior = await effectiveSubmissions(actor, f.year - 1, { dataset: "approved", mdaId: f.mdaId, sectorId: f.sectorId });
  const priorLines = prior.length
    ? await prisma.budgetLine.groupBy({ by: ["submissionId", "budgetCodeId"], where: { submissionId: { in: prior.map((p) => p.id) }, budgetCodeId: { in: [...new Set(lines.map((l) => l.budgetCodeId))] }, capitalProjectId: null }, _sum: { amount: true } })
    : [];
  const priorMda = new Map(prior.map((p) => [p.id, p.mdaId]));
  const baseline = new Map<string, number>();
  for (const p of priorLines) {
    const k = `${priorMda.get(p.submissionId)}|${p.budgetCodeId}`;
    baseline.set(k, toAmount((baseline.get(k) ?? 0) + Number(p._sum.amount ?? 0)));
  }
  const en = actor.locale === "en";
  return {
    total,
    totals: { revenue: Number(sums.find((s) => s.kind === "REVENUE")?._sum.amount ?? 0), expenditure: Number(sums.find((s) => s.kind === "EXPENDITURE")?._sum.amount ?? 0) },
    rows: lines.map((l) => {
      const base = l.capitalProjectId ? undefined : baseline.get(`${l.submission.mdaId}|${l.budgetCodeId}`);
      const ch = base === undefined ? null : calculateChange(Number(l.amount), base);
      return {
        id: l.id,
        submissionId: l.submission.id,
        status: l.submission.status,
        editable: canEditSubmission(actor, l.submission),
        mdaCode: l.submission.mda.code,
        mdaName: en && l.submission.mda.nameEn ? l.submission.mda.nameEn : l.submission.mda.name,
        code: l.budgetCode.code,
        codeName: en && l.budgetCode.nameEn ? l.budgetCode.nameEn : l.budgetCode.name,
        category: l.budgetCode.category ? (en ? l.budgetCode.category.name : l.budgetCode.category.nameSo) : null,
        kind: l.kind,
        description: l.description ?? l.capitalProject?.name ?? null,
        amount: Number(l.amount),
        prior: base ?? null,
        change: ch?.amount ?? null,
        changePct: ch?.percent ?? null,
        source: l.source,
      };
    }),
  };
}

export async function listPersonnel(actor: Actor, f: ListFilters) {
  const subs = await submissionMap(actor, f);
  const rows = await prisma.personnelBudget.findMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
    include: { submission: { select: { id: true, status: true, mda: { select: { code: true, name: true, nameEn: true } } } } },
    orderBy: [{ submission: { mda: { code: "asc" } } }, { sortOrder: "asc" }],
  });
  const en = actor.locale === "en";
  return rows.map((r) => ({
    id: r.id,
    submissionId: r.submission.id,
    status: r.submission.status,
    mda: `${r.submission.mda.code} ${en && r.submission.mda.nameEn ? r.submission.mda.nameEn : r.submission.mda.name}`,
    position: r.positionTitle,
    grade: r.grade,
    department: r.department,
    establishment: r.approvedEstablishment,
    filled: r.filledPositions,
    vacant: Math.max(0, r.approvedEstablishment - r.filledPositions),
    monthly: Number(r.monthlyCost),
    annual: Number(r.annualCost),
  }));
}

export async function listCapitalProjects(actor: Actor, f: ListFilters & { status?: string; q?: string }) {
  const subs = await submissionMap(actor, f);
  const allocations = await prisma.budgetLine.groupBy({ by: ["capitalProjectId", "submissionId"], where: { submissionId: { in: subs.map((s) => s.id) }, capitalProjectId: { not: null } }, _sum: { amount: true } });
  const scope = mdaScope(actor);
  const today = new Date();
  const delayed = f.status === "delayed";
  const projects = await prisma.capitalProject.findMany({
    where: {
      deletedAt: null,
      ...(scope ? { mdaId: scope } : {}),
      ...(f.mdaId ? { mdaId: f.mdaId } : {}),
      ...(f.sectorId ? { mda: { sectorId: f.sectorId } } : {}),
      ...(delayed ? { expectedCompletionDate: { lt: today }, status: { notIn: ["COMPLETED", "CANCELLED"] } } : f.status ? { status: f.status as ProjectStatus } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q } }, { projectCode: { contains: f.q } }, { location: { contains: f.q } }] } : {}),
      // Projects in this year's budgets, plus active projects without an allocation this year.
      AND: [{ OR: [{ id: { in: allocations.map((a) => a.capitalProjectId!) } }, { status: { in: ["ACTIVE", "APPROVED"] } }] }],
    },
    include: { mda: { select: { code: true, name: true, nameEn: true } }, fundingSource: { select: { name: true, nameEn: true } } },
    orderBy: [{ mda: { code: "asc" } }, { name: "asc" }],
  });
  const en = actor.locale === "en";
  return projects.map((p) => {
    const alloc = allocations.find((a) => a.capitalProjectId === p.id);
    const isDelayed = Boolean(p.expectedCompletionDate && p.expectedCompletionDate < today && !["COMPLETED", "CANCELLED"].includes(p.status));
    return {
      id: p.id,
      submissionId: alloc?.submissionId ?? null,
      code: p.projectCode,
      name: p.name,
      mda: `${p.mda.code} ${en && p.mda.nameEn ? p.mda.nameEn : p.mda.name}`,
      location: p.location,
      funding: p.fundingSource ? (en && p.fundingSource.nameEn ? p.fundingSource.nameEn : p.fundingSource.name) : p.fundingType,
      totalCost: Number(p.totalCost),
      spent: Number(p.spentToDate),
      allocation: Number(alloc?._sum.amount ?? 0),
      progress: Number(p.totalCost) > 0 ? Math.min(100, (Number(p.spentToDate) / Number(p.totalCost)) * 100) : null,
      completion: p.expectedCompletionDate,
      status: p.status,
      delayed: isDelayed,
    };
  });
}

export async function listProcurement(actor: Actor, f: ListFilters & { quarter?: string }) {
  const subs = await submissionMap(actor, f);
  const rows = await prisma.procurementPlan.findMany({
    where: { submissionId: { in: subs.map((s) => s.id) }, ...(f.quarter && ["Q1", "Q2", "Q3", "Q4"].includes(f.quarter) ? { quarter: f.quarter as "Q1" } : {}) },
    include: { submission: { select: { id: true, mda: { select: { code: true, name: true, nameEn: true } } } }, procurementMethod: true, budgetCategory: true },
    orderBy: [{ submission: { mda: { code: "asc" } } }, { quarter: "asc" }, { sortOrder: "asc" }],
  });
  const en = actor.locale === "en";
  return rows.map((r) => ({
    id: r.id,
    submissionId: r.submission.id,
    mda: `${r.submission.mda.code} ${en && r.submission.mda.nameEn ? r.submission.mda.nameEn : r.submission.mda.name}`,
    item: r.itemDescription,
    category: r.budgetCategory ? (en ? r.budgetCategory.name : r.budgetCategory.nameSo) : null,
    method: r.procurementMethod ? (en && r.procurementMethod.nameEn ? r.procurementMethod.nameEn : r.procurementMethod.name) : null,
    quarter: r.quarter,
    department: r.responsibleDepartment,
    cost: Number(r.estimatedCost),
  }));
}

export async function listCashFlow(actor: Actor, f: ListFilters) {
  const subs = await submissionMap(actor, f);
  const rows = await prisma.budgetSubmission.findMany({ where: { id: { in: subs.map((s) => s.id) } }, include: { mda: { select: { code: true, name: true, nameEn: true } }, cashFlow: true }, orderBy: { mda: { code: "asc" } } });
  const en = actor.locale === "en";
  return rows.map((s) => {
    const q = (k: string) => Number(s.cashFlow.find((c) => c.quarter === k)?.amount ?? 0);
    const total = toAmount(q("Q1") + q("Q2") + q("Q3") + q("Q4"));
    return { submissionId: s.id, status: s.status, mda: `${s.mda.code} ${en && s.mda.nameEn ? s.mda.nameEn : s.mda.name}`, q1: q("Q1"), q2: q("Q2"), q3: q("Q3"), q4: q("Q4"), total, budget: Number(s.totalExpenditure), difference: toAmount(total - Number(s.totalExpenditure)) };
  });
}

export function assertMda(actor: Actor, mdaId?: string) {
  return !mdaId || canAccessMda(actor, mdaId);
}

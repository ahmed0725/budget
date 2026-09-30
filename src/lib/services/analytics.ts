/**
 * Analytics queries for dashboards, analysis and reports.
 *
 * "Effective budget" of an MDA for a year = its latest approved (not superseded)
 * submission; when none is approved yet (preparation year), its latest proposal.
 * Actors restricted to approved data (executive viewers) only see approved budgets.
 * All queries respect the actor's MDA scope.
 */
import { Prisma } from "@/generated/prisma/client";
import { mdaScope, type Actor } from "@/lib/auth/actor";
import { calculateExecutionRate, calculateRevenueCollectionRate, calculateVariance, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";

export type Dataset = "effective" | "approved";

export function scopeSql(actor: Actor, alias = "s"): Prisma.Sql {
  const scope = mdaScope(actor);
  if (!scope) return Prisma.empty;
  if (scope.in.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${Prisma.raw(`${alias}."mdaId"`)} IN (${Prisma.join(scope.in)})`;
}

/** SQL for the effective submission id per (MDA, year) — used as a CTE. */
export function effectiveCte(actor: Actor, years: number[], opts: { dataset?: Dataset; mdaId?: string; sectorId?: string; mdaIds?: string[] } = {}): Prisma.Sql {
  const approvedOnly = actor.approvedOnly || opts.dataset === "approved";
  return Prisma.sql`
    eff AS (
      SELECT id, "mdaId", year FROM (
        SELECT s.id, s."mdaId", y.year,
          ROW_NUMBER() OVER (
            PARTITION BY s."mdaId", s."budgetYearId"
            ORDER BY (s.status IN ('APPROVED','PUBLISHED') AND s."supersededAt" IS NULL) DESC, s."revisionNumber" DESC, s."updatedAt" DESC
          ) AS rn
        FROM budget_submissions s
        JOIN budget_years y ON y.id = s."budgetYearId"
        JOIN mdas m ON m.id = s."mdaId"
        WHERE y.year IN (${Prisma.join(years)})
          AND s.status <> 'REJECTED'
          ${approvedOnly ? Prisma.sql`AND s.status IN ('APPROVED','PUBLISHED') AND s."supersededAt" IS NULL` : Prisma.empty}
          ${opts.mdaId ? Prisma.sql`AND s."mdaId" = ${opts.mdaId}` : Prisma.empty}
          ${opts.mdaIds ? (opts.mdaIds.length ? Prisma.sql`AND s."mdaId" IN (${Prisma.join(opts.mdaIds)})` : Prisma.sql`AND FALSE`) : Prisma.empty}
          ${opts.sectorId ? Prisma.sql`AND m."sectorId" = ${opts.sectorId}` : Prisma.empty}
          ${scopeSql(actor)}
      ) ranked WHERE rn = 1
    )`;
}

const n = (v: unknown) => toAmount(v as number);

export interface YearTotal {
  year: number;
  expenditure: number;
  revenue: number;
  personnel: number;
  capital: number;
  recurrent: number;
  mdas: number;
}

export async function yearTotals(actor: Actor, years: number[], opts: { dataset?: Dataset; mdaId?: string; sectorId?: string } = {}): Promise<YearTotal[]> {
  if (years.length === 0) return [];
  const rows = await prisma.$queryRaw<{ year: number; kind: string; group: string | null; iscapital: boolean | null; amount: string; mdas: bigint }[]>`
    WITH ${effectiveCte(actor, years, opts)}
    SELECT e.year, l.kind::text AS kind, c."summaryGroup"::text AS group, c."isCapital" AS iscapital,
           SUM(l.amount)::text AS amount, COUNT(DISTINCT e."mdaId") AS mdas
    FROM eff e
    JOIN budget_lines l ON l."submissionId" = e.id
    JOIN budget_codes bc ON bc.id = l."budgetCodeId"
    LEFT JOIN budget_categories c ON c.id = bc."categoryId"
    GROUP BY e.year, l.kind, c."summaryGroup", c."isCapital"`;
  const mdaCounts = await prisma.$queryRaw<{ year: number; mdas: bigint }[]>`WITH ${effectiveCte(actor, years, opts)} SELECT year, COUNT(*) AS mdas FROM eff GROUP BY year`;
  return years.map((year) => {
    const rs = rows.filter((r) => r.year === year);
    const exp = rs.filter((r) => r.kind === "EXPENDITURE");
    const sumOf = (list: typeof rs) => toAmount(list.reduce((a, r) => a + Number(r.amount), 0));
    return {
      year,
      expenditure: sumOf(exp),
      revenue: sumOf(rs.filter((r) => r.kind === "REVENUE")),
      personnel: sumOf(exp.filter((r) => r.group === "PERSONNEL")),
      capital: sumOf(exp.filter((r) => r.iscapital)),
      recurrent: sumOf(exp.filter((r) => !r.iscapital)),
      mdas: Number(mdaCounts.find((m) => m.year === year)?.mdas ?? 0),
    };
  });
}

export interface MdaBudget {
  mdaId: string;
  code: string;
  name: string;
  nameEn: string | null;
  sector: string;
  sectorEn: string | null;
  sectorId: string;
  expenditure: number;
  revenue: number;
  personnel: number;
  capital: number;
  status: string;
  submissionId: string;
}

export async function budgetByMda(actor: Actor, year: number, opts: { dataset?: Dataset; sectorId?: string; mdaId?: string } = {}): Promise<MdaBudget[]> {
  const rows = await prisma.$queryRaw<{ mdaid: string; code: string; name: string; nameen: string | null; sector: string; sectoren: string | null; sectorid: string; status: string; sid: string; exp: string | null; rev: string | null; pers: string | null; cap: string | null }[]>`
    WITH ${effectiveCte(actor, [year], opts)}
    SELECT m.id AS mdaid, m.code, m.name, m."nameEn" AS nameen, sec.name AS sector, sec."nameEn" AS sectoren, sec.id AS sectorid, s.status::text AS status, s.id AS sid,
      SUM(CASE WHEN l.kind = 'EXPENDITURE' THEN l.amount ELSE 0 END)::text AS exp,
      SUM(CASE WHEN l.kind = 'REVENUE' THEN l.amount ELSE 0 END)::text AS rev,
      SUM(CASE WHEN l.kind = 'EXPENDITURE' AND c."summaryGroup" = 'PERSONNEL' THEN l.amount ELSE 0 END)::text AS pers,
      SUM(CASE WHEN l.kind = 'EXPENDITURE' AND c."isCapital" THEN l.amount ELSE 0 END)::text AS cap
    FROM eff e
    JOIN budget_submissions s ON s.id = e.id
    JOIN mdas m ON m.id = e."mdaId"
    JOIN sectors sec ON sec.id = m."sectorId"
    LEFT JOIN budget_lines l ON l."submissionId" = e.id
    LEFT JOIN budget_codes bc ON bc.id = l."budgetCodeId"
    LEFT JOIN budget_categories c ON c.id = bc."categoryId"
    GROUP BY m.id, m.code, m.name, m."nameEn", sec.name, sec."nameEn", sec.id, s.status, s.id
    ORDER BY SUM(CASE WHEN l.kind = 'EXPENDITURE' THEN l.amount ELSE 0 END) DESC NULLS LAST`;
  return rows.map((r) => ({
    mdaId: r.mdaid,
    code: r.code,
    name: r.name,
    nameEn: r.nameen,
    sector: r.sector,
    sectorEn: r.sectoren,
    sectorId: r.sectorid,
    expenditure: n(r.exp),
    revenue: n(r.rev),
    personnel: n(r.pers),
    capital: n(r.cap),
    status: r.status,
    submissionId: r.sid,
  }));
}

export interface CategoryAmount {
  categoryId: string | null;
  code: string;
  name: string;
  nameSo: string;
  kind: string;
  amount: number;
}

export async function budgetByCategory(actor: Actor, year: number, opts: { dataset?: Dataset; mdaId?: string; mdaIds?: string[]; sectorId?: string; kind?: "REVENUE" | "EXPENDITURE" } = {}): Promise<CategoryAmount[]> {
  const rows = await prisma.$queryRaw<{ id: string | null; code: string | null; name: string | null; nameso: string | null; kind: string; sortorder: number | null; amount: string }[]>`
    WITH ${effectiveCte(actor, [year], opts)}
    SELECT c.id, c.code, c.name, c."nameSo" AS nameso, l.kind::text AS kind, c."sortOrder" AS sortorder, SUM(l.amount)::text AS amount
    FROM eff e
    JOIN budget_lines l ON l."submissionId" = e.id
    JOIN budget_codes bc ON bc.id = l."budgetCodeId"
    LEFT JOIN budget_categories c ON c.id = bc."categoryId"
    ${opts.kind ? Prisma.sql`WHERE l.kind = ${opts.kind}::"BudgetKind"` : Prisma.empty}
    GROUP BY c.id, c.code, c.name, c."nameSo", l.kind, c."sortOrder"
    ORDER BY c."sortOrder" NULLS LAST`;
  return rows.map((r) => ({ categoryId: r.id, code: r.code ?? "UNCATEGORISED", name: r.name ?? "Uncategorised", nameSo: r.nameso ?? "Aan la kala saarin", kind: r.kind, amount: n(r.amount) }));
}

/** Amounts rolled up to a code level (e.g. revenue by source = level 2). */
export async function budgetByCodeLevel(actor: Actor, year: number, kind: "REVENUE" | "EXPENDITURE", level: number, opts: { dataset?: Dataset; mdaId?: string; sectorId?: string; parentPath?: string } = {}) {
  const rows = await prisma.$queryRaw<{ code: string; name: string; nameen: string | null; id: string; amount: string }[]>`
    WITH ${effectiveCte(actor, [year], opts)},
    lines AS (
      SELECT l.amount, bc.path FROM eff e
      JOIN budget_lines l ON l."submissionId" = e.id AND l.kind = ${kind}::"BudgetKind"
      JOIN budget_codes bc ON bc.id = l."budgetCodeId"
    )
    SELECT a.code, a.name, a."nameEn" AS nameen, a.id, SUM(lines.amount)::text AS amount
    FROM budget_codes a
    JOIN lines ON (lines.path = a.path OR lines.path LIKE a.path || '/%')
    WHERE a.kind = ${kind}::"BudgetKind" AND a.level = ${level}
      ${opts.parentPath ? Prisma.sql`AND a.path LIKE ${opts.parentPath + "/%"}` : Prisma.empty}
    GROUP BY a.code, a.name, a."nameEn", a.id
    ORDER BY SUM(lines.amount) DESC`;
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, nameEn: r.nameen, amount: n(r.amount) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

function execScope(actor: Actor, opts: { mdaId?: string; sectorId?: string }): Prisma.Sql {
  return Prisma.sql`
    ${opts.mdaId ? Prisma.sql`AND x."mdaId" = ${opts.mdaId}` : Prisma.empty}
    ${opts.sectorId ? Prisma.sql`AND x."mdaId" IN (SELECT id FROM mdas WHERE "sectorId" = ${opts.sectorId})` : Prisma.empty}
    ${scopeSql(actor, "x")}`;
}

export interface MonthlyExecution {
  month: number;
  planned: number;
  actual: number;
  cumulativePlanned: number;
  cumulativeActual: number;
}

export async function expenditureMonthly(actor: Actor, year: number, opts: { mdaId?: string; sectorId?: string; codePath?: string } = {}): Promise<MonthlyExecution[]> {
  const rows = await prisma.$queryRaw<{ month: number; planned: string; actual: string }[]>`
    SELECT x.month, SUM(x."plannedAmount")::text AS planned, SUM(x."actualAmount")::text AS actual
    FROM expenditure_execution x
    JOIN budget_years y ON y.id = x."budgetYearId"
    ${opts.codePath ? Prisma.sql`JOIN budget_codes bc ON bc.id = x."budgetCodeId"` : Prisma.empty}
    WHERE y.year = ${year} ${execScope(actor, opts)}
      ${opts.codePath ? Prisma.sql`AND (bc.path = ${opts.codePath} OR bc.path LIKE ${opts.codePath + "/%"})` : Prisma.empty}
    GROUP BY x.month ORDER BY x.month`;
  let cp = 0;
  let ca = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const r = rows.find((x) => x.month === i + 1);
    const planned = n(r?.planned ?? 0);
    const actual = n(r?.actual ?? 0);
    cp = toAmount(cp + planned);
    ca = toAmount(ca + actual);
    return { month: i + 1, planned, actual, cumulativePlanned: cp, cumulativeActual: ca };
  });
}

export async function revenueMonthly(actor: Actor, year: number, opts: { mdaId?: string; sectorId?: string } = {}) {
  const rows = await prisma.$queryRaw<{ month: number; target: string; actual: string }[]>`
    SELECT x.month, SUM(x."targetAmount")::text AS target, SUM(x."actualAmount")::text AS actual
    FROM revenue_execution x JOIN budget_years y ON y.id = x."budgetYearId"
    WHERE y.year = ${year} ${execScope(actor, opts)}
    GROUP BY x.month ORDER BY x.month`;
  return Array.from({ length: 12 }, (_, i) => {
    const r = rows.find((x) => x.month === i + 1);
    return { month: i + 1, target: n(r?.target ?? 0), actual: n(r?.actual ?? 0) };
  });
}

export interface ExecutionSummary {
  originalBudget: number;
  revisedBudget: number;
  actual: number;
  committed: number;
  obligated: number;
  available: number;
  executionRate: number | null;
  revenueTarget: number;
  revenueActual: number;
  collectionRate: number | null;
  lastActualMonth: number;
}

export async function executionSummary(actor: Actor, year: number, opts: { mdaId?: string; sectorId?: string } = {}): Promise<ExecutionSummary> {
  const [alloc] = await prisma.$queryRaw<{ orig: string | null; rev: string | null; rtarget: string | null }[]>`
    SELECT SUM(CASE WHEN x.kind = 'EXPENDITURE' THEN x."originalAmount" END)::text AS orig,
           SUM(CASE WHEN x.kind = 'EXPENDITURE' THEN x."revisedAmount" END)::text AS rev,
           SUM(CASE WHEN x.kind = 'REVENUE' THEN x."revisedAmount" END)::text AS rtarget
    FROM budget_execution x JOIN budget_years y ON y.id = x."budgetYearId"
    WHERE y.year = ${year} ${execScope(actor, opts)}`;
  const [exp] = await prisma.$queryRaw<{ actual: string | null; lastmonth: number | null }[]>`
    SELECT SUM(x."actualAmount")::text AS actual, MAX(CASE WHEN x."actualAmount" <> 0 THEN x.month END) AS lastmonth
    FROM expenditure_execution x JOIN budget_years y ON y.id = x."budgetYearId"
    WHERE y.year = ${year} ${execScope(actor, opts)}`;
  const [rev] = await prisma.$queryRaw<{ actual: string | null }[]>`
    SELECT SUM(x."actualAmount")::text AS actual FROM revenue_execution x JOIN budget_years y ON y.id = x."budgetYearId"
    WHERE y.year = ${year} ${execScope(actor, opts)}`;
  const [com] = await prisma.$queryRaw<{ committed: string | null; obligated: string | null }[]>`
    SELECT SUM(CASE WHEN x.status IN ('COMMITTED','OBLIGATED') THEN x.amount END)::text AS committed,
           SUM(CASE WHEN x.status = 'OBLIGATED' THEN x.amount END)::text AS obligated
    FROM commitments x JOIN budget_years y ON y.id = x."budgetYearId"
    WHERE y.year = ${year} ${execScope(actor, opts)}`;
  const revised = n(alloc?.rev ?? 0);
  const actual = n(exp?.actual ?? 0);
  const committed = n(com?.committed ?? 0);
  const revenueTarget = n(alloc?.rtarget ?? 0);
  const revenueActual = n(rev?.actual ?? 0);
  return {
    originalBudget: n(alloc?.orig ?? 0),
    revisedBudget: revised,
    actual,
    committed,
    obligated: n(com?.obligated ?? 0),
    available: toAmount(revised - actual - committed),
    executionRate: calculateExecutionRate(actual, revised),
    revenueTarget,
    revenueActual,
    collectionRate: calculateRevenueCollectionRate(revenueActual, revenueTarget),
    lastActualMonth: exp?.lastmonth ?? 0,
  };
}

export interface MdaExecution {
  mdaId: string;
  code: string;
  name: string;
  nameEn: string | null;
  budget: number;
  actual: number;
  committed: number;
  available: number;
  executionRate: number | null;
  plannedToDate: number;
  variance: number;
}

export async function executionByMda(actor: Actor, year: number, opts: { sectorId?: string; mdaId?: string } = {}): Promise<MdaExecution[]> {
  const rows = await prisma.$queryRaw<{ mdaid: string; code: string; name: string; nameen: string | null; budget: string | null; actual: string | null; planned: string | null; committed: string | null }[]>`
    WITH a AS (
      SELECT x."mdaId", SUM(x."revisedAmount") AS budget FROM budget_execution x JOIN budget_years y ON y.id = x."budgetYearId"
      WHERE y.year = ${year} AND x.kind = 'EXPENDITURE' ${execScope(actor, opts)} GROUP BY x."mdaId"
    ), e AS (
      SELECT x."mdaId", SUM(x."actualAmount") AS actual,
        SUM(CASE WHEN x.month <= (SELECT COALESCE(MAX(month), 0) FROM expenditure_execution z JOIN budget_years yy ON yy.id = z."budgetYearId" WHERE yy.year = ${year} AND z."actualAmount" <> 0) THEN x."plannedAmount" ELSE 0 END) AS planned
      FROM expenditure_execution x JOIN budget_years y ON y.id = x."budgetYearId"
      WHERE y.year = ${year} ${execScope(actor, opts)} GROUP BY x."mdaId"
    ), c AS (
      SELECT x."mdaId", SUM(x.amount) AS committed FROM commitments x JOIN budget_years y ON y.id = x."budgetYearId"
      WHERE y.year = ${year} AND x.status IN ('COMMITTED','OBLIGATED') ${execScope(actor, opts)} GROUP BY x."mdaId"
    )
    SELECT m.id AS mdaid, m.code, m.name, m."nameEn" AS nameen, a.budget::text, e.actual::text, e.planned::text, c.committed::text
    FROM a JOIN mdas m ON m.id = a."mdaId" LEFT JOIN e ON e."mdaId" = a."mdaId" LEFT JOIN c ON c."mdaId" = a."mdaId"
    ORDER BY a.budget DESC`;
  return rows.map((r) => {
    const budget = n(r.budget ?? 0);
    const actual = n(r.actual ?? 0);
    const committed = n(r.committed ?? 0);
    const plannedToDate = n(r.planned ?? 0);
    return {
      mdaId: r.mdaid,
      code: r.code,
      name: r.name,
      nameEn: r.nameen,
      budget,
      actual,
      committed,
      available: toAmount(budget - actual - committed),
      executionRate: calculateExecutionRate(actual, budget),
      plannedToDate,
      variance: calculateVariance(plannedToDate, actual).amount,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission progress and alerts
// ─────────────────────────────────────────────────────────────────────────────

export async function submissionProgress(actor: Actor, year: number) {
  const scope = mdaScope(actor);
  const [byStatus, mdas, withBudget] = await Promise.all([
    prisma.budgetSubmission.groupBy({ by: ["status"], where: { budgetYear: { year }, type: "ORIGINAL", ...(scope ? { mdaId: scope } : {}) }, _count: { _all: true } }),
    prisma.mda.count({ where: { isActive: true, deletedAt: null, ...(scope ? { id: scope } : {}) } }),
    prisma.budgetSubmission.aggregate({ where: { budgetYear: { year }, type: "ORIGINAL", ...(scope ? { mdaId: scope } : {}) }, _sum: { validationErrors: true }, _avg: { completion: true } }),
  ]);
  const count = (statuses: string[]) => byStatus.filter((b) => statuses.includes(b.status)).reduce((a, b) => a + b._count._all, 0);
  const started = byStatus.reduce((a, b) => a + b._count._all, 0);
  return {
    mdas,
    notStarted: Math.max(0, mdas - started),
    draft: count(["DRAFT"]),
    returned: count(["RETURNED"]),
    submitted: count(["SUBMITTED"]),
    inReview: count(["UNDER_REVIEW", "RECOMMENDED", "ENDORSED"]),
    awaitingApproval: count(["ENDORSED"]),
    approved: count(["APPROVED", "PUBLISHED"]),
    rejected: count(["REJECTED"]),
    validationErrors: withBudget._sum.validationErrors ?? 0,
    averageCompletion: Math.round(withBudget._avg.completion ?? 0),
    byStatus: byStatus.map((b) => ({ status: b.status, count: b._count._all })),
  };
}

export type AlertSeverity = "critical" | "serious" | "warning" | "info";
export interface ManagementAlert {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
}

/** Management alerts (spec: deadline, non-submission, validation, revenue, spending, projects, variance). */
export async function managementAlerts(actor: Actor, opts: { preparationYear?: number; executionYear?: number; largeVariancePercent: number; revenueAlertPercent: number; locale?: "en" | "so" }): Promise<ManagementAlert[]> {
  const alerts: ManagementAlert[] = [];
  const L = (en: string, so: string) => (opts.locale === "so" ? so : en);
  const scope = mdaScope(actor);
  const mdaWhere = scope ? { id: scope } : {};

  if (opts.preparationYear && !actor.approvedOnly) {
    const year = await prisma.budgetYear.findUnique({ where: { year: opts.preparationYear } });
    if (year?.submissionDeadline) {
      const days = Math.ceil((year.submissionDeadline.getTime() - Date.now()) / 86_400_000);
      const missing = await prisma.mda.findMany({
        where: { isActive: true, deletedAt: null, ...mdaWhere, submissions: { none: { budgetYearId: year.id, status: { notIn: ["DRAFT", "RETURNED"] } } } },
        select: { code: true, name: true },
        orderBy: { code: "asc" },
      });
      if (days >= 0 && days <= 14 && missing.length) {
        alerts.push({ key: "deadline", severity: days <= 3 ? "serious" : "warning", title: L(`Submission deadline in ${days} day(s)`, `Waqtiga gudbinta: ${days} maalmood ayaa haray`), detail: L(`${missing.length} MDA(s) have not submitted their ${year.year} budget.`, `${missing.length} hay'adood weli ma gudbin miisaaniyadda ${year.year}.`), href: `/submissions/pending?year=${year.year}` });
      }
      if (days < 0 && missing.length) {
        alerts.push({ key: "overdue", severity: "critical", title: L(`${missing.length} MDA(s) missed the ${year.year} deadline`, `${missing.length} hay'adood ayaa dhaafay waqtiga ${year.year}`), detail: missing.slice(0, 6).map((m) => m.code).join(", ") + (missing.length > 6 ? "…" : ""), href: `/budget/submissions?year=${year.year}&status=DRAFT` });
      } else if (missing.length && days > 14) {
        alerts.push({ key: "not-submitted", severity: "info", title: L(`${missing.length} MDA(s) have not submitted`, `${missing.length} hay'adood weli ma gudbin`), detail: L(`${year.year} preparation is open until ${year.submissionDeadline.toISOString().slice(0, 10)}.`, `Diyaarinta ${year.year} waa furan tahay ilaa ${year.submissionDeadline.toISOString().slice(0, 10)}.`), href: `/budget/submissions?year=${year.year}` });
      }
    }
    const errors = await prisma.budgetSubmission.findMany({
      where: { budgetYear: { year: opts.preparationYear }, validationErrors: { gt: 0 }, status: { in: ["DRAFT", "RETURNED"] }, ...(scope ? { mdaId: scope } : {}) },
      select: { id: true, validationErrors: true, mda: { select: { code: true } } },
    });
    if (errors.length) {
      alerts.push({ key: "validation", severity: "warning", title: L(`${errors.length} budget(s) with validation errors`, `${errors.length} miisaaniyadood oo leh khaladaad hubin`), detail: errors.slice(0, 6).map((e) => `${e.mda.code} (${e.validationErrors})`).join(", "), href: `/budget/submissions?year=${opts.preparationYear}` });
    }
  }

  if (opts.executionYear) {
    const summary = await executionSummary(actor, opts.executionYear);
    if (summary.lastActualMonth > 0) {
      const rev = await revenueMonthly(actor, opts.executionYear);
      const targetToDate = rev.filter((r) => r.month <= summary.lastActualMonth).reduce((a, r) => a + r.target, 0);
      const actualToDate = rev.filter((r) => r.month <= summary.lastActualMonth).reduce((a, r) => a + r.actual, 0);
      const rate = calculateRevenueCollectionRate(actualToDate, targetToDate);
      if (rate !== null && rate < opts.revenueAlertPercent) {
        alerts.push({ key: "revenue-below", severity: rate < opts.revenueAlertPercent - 15 ? "serious" : "warning", title: L(`Revenue below target (${rate.toFixed(1)}% collected)`, `Dakhligu wuu ka hooseeyaa bartilmaameedka (${rate.toFixed(1)}%)`), detail: L(`Year-to-date collections are ${rate.toFixed(1)}% of the target for months 1–${summary.lastActualMonth}.`, `Ururinta sannadka ilaa hadda waa ${rate.toFixed(1)}% bartilmaameedka bilaha 1–${summary.lastActualMonth}.`), href: `/execution/revenue?year=${opts.executionYear}` });
      }
      const byMda = await executionByMda(actor, opts.executionYear);
      const over = byMda.filter((m) => m.plannedToDate > 0 && m.actual > m.plannedToDate * (1 + opts.largeVariancePercent / 100));
      if (over.length) {
        alerts.push({ key: "overspend", severity: "serious", title: L(`${over.length} MDA(s) spending above plan`, `${over.length} hay'adood ayaa ka kharash badiyey qorshaha`), detail: over.slice(0, 5).map((m) => `${m.code} (+${(((m.actual - m.plannedToDate) / m.plannedToDate) * 100).toFixed(0)}%)`).join(", "), href: `/execution/expenditure?year=${opts.executionYear}` });
      }
      const under = byMda.filter((m) => m.plannedToDate > 0 && m.actual < m.plannedToDate * (1 - opts.largeVariancePercent / 100));
      if (under.length) {
        alerts.push({ key: "variance", severity: "info", title: L(`${under.length} MDA(s) with large under-spending`, `${under.length} hay'adood oo kharash aad u yar`), detail: under.slice(0, 5).map((m) => m.code).join(", "), href: `/analysis/variance?year=${opts.executionYear}` });
      }
      const overCommitted = byMda.filter((m) => m.available < 0);
      if (overCommitted.length) {
        alerts.push({ key: "overcommitted", severity: "critical", title: L(`${overCommitted.length} MDA(s) committed beyond their budget`, `${overCommitted.length} hay'adood ayaa ballanqaaday in ka badan miisaaniyaddooda`), detail: overCommitted.slice(0, 5).map((m) => m.code).join(", "), href: `/execution/commitments?year=${opts.executionYear}` });
      }
    }
  }

  const delayed = await prisma.capitalProject.findMany({
    where: { deletedAt: null, status: { in: ["APPROVED", "ACTIVE"] }, expectedCompletionDate: { lt: new Date() }, ...(scope ? { mdaId: scope } : {}) },
    select: { id: true, name: true, mda: { select: { code: true } } },
    take: 10,
  });
  if (delayed.length) {
    alerts.push({ key: "projects-delayed", severity: "warning", title: L(`${delayed.length} capital project(s) delayed`, `${delayed.length} mashruuc raasamaal ayaa dib u dhacay`), detail: delayed.slice(0, 4).map((p) => `${p.mda.code}: ${p.name}`).join("; "), href: `/budget/capital-projects?status=delayed` });
  }
  const order: Record<AlertSeverity, number> = { critical: 0, serious: 1, warning: 2, info: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function topProjects(actor: Actor, year: number, limit = 8) {
  const scope = mdaScope(actor);
  const lines = await prisma.budgetLine.findMany({
    where: {
      capitalProjectId: { not: null },
      submission: { budgetYear: { year }, status: { not: "REJECTED" }, ...(actor.approvedOnly ? { status: { in: ["APPROVED", "PUBLISHED"] } } : {}), ...(scope ? { mdaId: scope } : {}) },
      capitalProject: { deletedAt: null },
    },
    include: { capitalProject: { include: { mda: { select: { code: true, name: true } }, fundingSource: true } } },
    orderBy: { amount: "desc" },
    take: limit,
  });
  return lines.map((l) => ({
    id: l.capitalProject!.id,
    name: l.capitalProject!.name,
    mda: l.capitalProject!.mda.code,
    location: l.capitalProject!.location,
    allocation: n(l.amount),
    totalCost: n(l.capitalProject!.totalCost),
    status: l.capitalProject!.status,
    funding: l.capitalProject!.fundingSource?.nameEn ?? l.capitalProject!.fundingSource?.name ?? l.capitalProject!.fundingType,
    submissionId: l.submissionId,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Report helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The effective submission of every MDA for a year (respects scope and dataset). */
export async function effectiveSubmissions(actor: Actor, year: number, opts: { dataset?: Dataset; mdaId?: string; sectorId?: string } = {}) {
  const rows = await prisma.$queryRaw<{ id: string; mdaid: string }[]>`WITH ${effectiveCte(actor, [year], opts)} SELECT id, "mdaId" AS mdaid FROM eff`;
  return rows.map((r) => ({ id: r.id, mdaId: r.mdaid }));
}

/** Expenditure per MDA and summary group (personnel, goods & services, capital, other). */
export async function budgetByMdaGroup(actor: Actor, year: number, opts: { dataset?: Dataset; mdaId?: string; sectorId?: string } = {}) {
  const rows = await prisma.$queryRaw<{ mdaid: string; grp: string | null; amount: string }[]>`
    WITH ${effectiveCte(actor, [year], opts)}
    SELECT e."mdaId" AS mdaid, c."summaryGroup"::text AS grp, SUM(l.amount)::text AS amount
    FROM eff e JOIN budget_lines l ON l."submissionId" = e.id AND l.kind = 'EXPENDITURE'
    JOIN budget_codes bc ON bc.id = l."budgetCodeId" LEFT JOIN budget_categories c ON c.id = bc."categoryId"
    GROUP BY e."mdaId", c."summaryGroup"`;
  return rows.map((r) => ({ mdaId: r.mdaid, group: r.grp ?? "OTHER", amount: n(r.amount) }));
}

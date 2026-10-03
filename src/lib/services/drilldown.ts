/**
 * Drill-down analysis: Government → Sector → MDA → Budget category → Economic item
 * (4-digit code) → Detailed code. Each level shows the children of the current node.
 *
 * measure "budget": effective budgets (latest approved, else latest proposal).
 * measure "actual": revised allocations of the published budget vs recorded actuals.
 */
import { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { calculateExecutionRate, calculateRevenueCollectionRate, calculateShare, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";
import { effectiveCte, scopeSql } from "./analytics";

export type DrillLevel = "sector" | "mda" | "category" | "item" | "code" | "mdaOfCode";

export interface DrillFilters {
  year: number;
  kind: "EXPENDITURE" | "REVENUE";
  measure: "budget" | "actual";
  sectorId?: string;
  mdaId?: string;
  categoryId?: string;
  codeId?: string;
}

export interface DrillRow {
  id: string;
  code: string | null;
  label: string;
  labelAlt: string | null;
  budget: number;
  actual: number;
  share: number | null;
  rate: number | null;
  /** Filter to add when drilling into this row (null at the deepest level). */
  next: Partial<Record<"sector" | "mda" | "category" | "code", string>> | null;
}

export interface Crumb {
  key: "root" | "sector" | "mda" | "category" | "code";
  id: string | null;
  label: string;
}

function levelFor(f: DrillFilters, hasChildren: boolean): DrillLevel {
  if (f.codeId) return hasChildren ? "code" : f.mdaId ? "code" : "mdaOfCode";
  if (f.categoryId) return "item";
  if (f.mdaId) return "category";
  if (f.sectorId) return "mda";
  return "sector";
}

export async function drilldown(actor: Actor, f: DrillFilters): Promise<{ level: DrillLevel; rows: DrillRow[]; total: { budget: number; actual: number; rate: number | null }; crumbs: Crumb[] }> {
  const code = f.codeId ? await prisma.budgetCode.findUnique({ where: { id: f.codeId }, select: { id: true, path: true, code: true, name: true, nameEn: true, _count: { select: { children: true } } } }) : null;
  const level = levelFor(f, Boolean(code && code._count.children > 0));
  const kindSql = Prisma.sql`${f.kind}`;

  const source =
    f.measure === "budget"
      ? Prisma.sql`
        WITH ${effectiveCte(actor, [f.year], { mdaId: f.mdaId, sectorId: f.sectorId })},
        src AS (
          SELECT e.mdaId, l.budgetCodeId, l.amount AS budget, CAST(0 AS DECIMAL(18,2)) AS actual
          FROM eff e JOIN budget_lines l ON l.submissionId = e.id AND l.kind = ${kindSql}
        )`
      : Prisma.sql`
        WITH src AS (
          SELECT x.mdaId, x.budgetCodeId, x.revisedAmount AS budget, CAST(0 AS DECIMAL(18,2)) AS actual
          FROM budget_execution x JOIN budget_years y ON y.id = x.budgetYearId
          WHERE y.year = ${f.year} AND x.kind = ${kindSql} ${scopeSql(actor, "x")}
          UNION ALL
          SELECT x.mdaId, x.budgetCodeId, CAST(0 AS DECIMAL(18,2)), x.actualAmount
          FROM ${Prisma.raw(f.kind === "EXPENDITURE" ? "expenditure_execution" : "revenue_execution")} x JOIN budget_years y ON y.id = x.budgetYearId
          WHERE y.year = ${f.year} ${scopeSql(actor, "x")}
        )`;

  const filters = Prisma.sql`
    ${f.sectorId ? Prisma.sql`AND m.sectorId = ${f.sectorId}` : Prisma.empty}
    ${f.mdaId ? Prisma.sql`AND m.id = ${f.mdaId}` : Prisma.empty}
    ${f.categoryId ? Prisma.sql`AND bc.categoryId = ${f.categoryId}` : Prisma.empty}
    ${code ? Prisma.sql`AND (bc.path = ${code.path} OR bc.path LIKE ${code.path + "/%"})` : Prisma.empty}`;

  let group: Prisma.Sql;
  switch (level) {
    case "sector":
      group = Prisma.sql`SELECT s.id, s.code, s.name AS label, s.nameEn AS alt, SUM(src.budget) AS budget, SUM(src.actual) AS actual
        FROM src JOIN mdas m ON m.id = src.mdaId JOIN budget_codes bc ON bc.id = src.budgetCodeId JOIN sectors s ON s.id = m.sectorId
        WHERE TRUE ${filters} GROUP BY s.id, s.code, s.name, s.nameEn`;
      break;
    case "mda":
    case "mdaOfCode":
      group = Prisma.sql`SELECT m.id, m.code, m.name AS label, m.nameEn AS alt, SUM(src.budget) AS budget, SUM(src.actual) AS actual
        FROM src JOIN mdas m ON m.id = src.mdaId JOIN budget_codes bc ON bc.id = src.budgetCodeId
        WHERE TRUE ${filters} GROUP BY m.id, m.code, m.name, m.nameEn`;
      break;
    case "category":
      group = Prisma.sql`SELECT COALESCE(c.id, 'none') AS id, c.code, COALESCE(c.name, 'Unclassified') AS label, c.nameSo AS alt, SUM(src.budget) AS budget, SUM(src.actual) AS actual
        FROM src JOIN mdas m ON m.id = src.mdaId JOIN budget_codes bc ON bc.id = src.budgetCodeId LEFT JOIN budget_categories c ON c.id = bc.categoryId
        WHERE TRUE ${filters} GROUP BY c.id, c.code, c.name, c.nameSo`;
      break;
    case "item":
      // Economic items: the 4-digit ancestor of each line (or the line code itself when shorter).
      group = Prisma.sql`SELECT a.id, a.code, a.name AS label, a.nameEn AS alt, SUM(src.budget) AS budget, SUM(src.actual) AS actual
        FROM src JOIN mdas m ON m.id = src.mdaId JOIN budget_codes bc ON bc.id = src.budgetCodeId
        JOIN budget_codes a ON a.kind = bc.kind AND (bc.path = a.path OR bc.path LIKE CONCAT(a.path, '/%')) AND a.level = LEAST(bc.level, 4)
        WHERE TRUE ${filters} GROUP BY a.id, a.code, a.name, a.nameEn`;
      break;
    case "code":
      group = Prisma.sql`SELECT a.id, a.code, a.name AS label, a.nameEn AS alt, SUM(src.budget) AS budget, SUM(src.actual) AS actual
        FROM src JOIN mdas m ON m.id = src.mdaId JOIN budget_codes bc ON bc.id = src.budgetCodeId
        JOIN budget_codes a ON a.parentId = ${code!.id} AND (bc.path = a.path OR bc.path LIKE CONCAT(a.path, '/%'))
        WHERE TRUE ${filters} GROUP BY a.id, a.code, a.name, a.nameEn`;
      break;
  }
  const raw = await prisma.$queryRaw<{ id: string; code: string | null; label: string; alt: string | null; budget: string | null; actual: string | null }[]>`${source} ${group!}`;
  const total = { budget: toAmount(raw.reduce((s, r) => s + Number(r.budget ?? 0), 0)), actual: toAmount(raw.reduce((s, r) => s + Number(r.actual ?? 0), 0)) };
  const rate = (a: number, b: number) => (f.kind === "EXPENDITURE" ? calculateExecutionRate(a, b) : calculateRevenueCollectionRate(a, b));
  const measureValue = (b: number, a: number) => (f.measure === "actual" ? a : b);
  const en = actor.locale === "en";
  const rows: DrillRow[] = raw
    .map((r) => {
      const budget = toAmount(Number(r.budget ?? 0));
      const actual = toAmount(Number(r.actual ?? 0));
      // Category rows carry the English name in `label` and Somali in `alt`.
      const [primary, secondary] = level === "category" ? (en ? [r.label, r.alt] : [r.alt ?? r.label, r.label]) : en && r.alt ? [r.alt, r.label] : [r.label, r.alt];
      const next: DrillRow["next"] =
        level === "sector" ? { sector: r.id } : level === "mda" ? { mda: r.id } : level === "category" ? (r.id === "none" ? null : { category: r.id }) : level === "item" || level === "code" ? { code: r.id } : level === "mdaOfCode" ? { mda: r.id } : null;
      return { id: r.id, code: level === "category" ? null : r.code, label: primary, labelAlt: secondary !== primary ? secondary : null, budget, actual, share: calculateShare(measureValue(budget, actual), measureValue(total.budget, total.actual)), rate: f.measure === "actual" ? rate(actual, budget) : null, next };
    })
    .filter((r) => r.budget !== 0 || r.actual !== 0)
    .sort((a, b) => measureValue(b.budget, b.actual) - measureValue(a.budget, a.actual));

  // Breadcrumbs for the current position.
  const crumbs: Crumb[] = [{ key: "root", id: null, label: "" }];
  const [sector, mda, category] = await Promise.all([
    f.sectorId ? prisma.sector.findUnique({ where: { id: f.sectorId } }) : null,
    f.mdaId ? prisma.mda.findUnique({ where: { id: f.mdaId } }) : null,
    f.categoryId ? prisma.budgetCategory.findUnique({ where: { id: f.categoryId } }) : null,
  ]);
  if (sector) crumbs.push({ key: "sector", id: sector.id, label: `${sector.code} ${en && sector.nameEn ? sector.nameEn : sector.name}` });
  if (mda) crumbs.push({ key: "mda", id: mda.id, label: `${mda.code} ${en && mda.nameEn ? mda.nameEn : mda.name}` });
  if (category) crumbs.push({ key: "category", id: category.id, label: en ? category.name : category.nameSo });
  if (code) {
    const ancestors = await prisma.budgetCode.findMany({ where: { kind: f.kind, path: { in: code.path.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")) } }, orderBy: { level: "asc" } });
    for (const a of ancestors.filter((a) => a.level >= 4 || a.id === code.id)) crumbs.push({ key: "code", id: a.id, label: `${a.code} ${en && a.nameEn ? a.nameEn : a.name}` });
  }
  return { level, rows, total: { ...total, rate: f.measure === "actual" ? rate(total.actual, total.budget) : null }, crumbs };
}

/**
 * Report builder (spec §42): users choose the data source, filters, grouping (up to
 * three levels), measures and sorting; configurations can be saved and shared.
 * Results use the standard ReportResult so they print and export like any report.
 */
import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { can, type Actor } from "@/lib/auth/actor";
import { calculateChange, calculateExecutionRate, calculateShare, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Locale } from "@/lib/i18n";
import { effectiveCte } from "@/lib/services/analytics";
import { audit } from "@/lib/services/audit";
import { executionLines } from "@/lib/services/execution";
import type { ReportColumn, ReportResult } from "./types";

export const DIMENSIONS = ["sector", "mda", "category", "item", "code", "kind"] as const;
export const BUDGET_MEASURES = ["amount", "prior", "change", "changePct", "share"] as const;
export const EXECUTION_MEASURES = ["budget", "actual", "committed", "available", "rate", "share"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const builderConfigSchema = z.object({
  source: z.enum(["budget", "execution"]),
  year: z.number().int().min(1990).max(2100),
  dataset: z.enum(["effective", "approved"]).default("effective"),
  kind: z.enum(["EXPENDITURE", "REVENUE", "ALL"]).default("EXPENDITURE"),
  sectorId: z.string().max(64).nullish(),
  mdaId: z.string().max(64).nullish(),
  categoryId: z.string().max(64).nullish(),
  codePrefix: z.string().regex(/^\d{0,10}$/, "Codes contain digits only").nullish(),
  groupBy: z.array(z.enum(DIMENSIONS)).min(1, "Choose at least one grouping").max(3),
  measures: z.array(z.string()).min(1, "Choose at least one column to show").max(8),
  sortBy: z.string().max(40).default("amount"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(5000).nullish(),
});
export type BuilderConfig = z.infer<typeof builderConfigSchema>;

interface Detail {
  sectorId: string;
  sector: string;
  mdaId: string;
  mda: string;
  categoryId: string;
  category: string;
  item: string;
  code: string;
  kind: string;
  amount: number;
  prior: number;
  budget: number;
  actual: number;
  committed: number;
  available: number;
}

type Row = { [K in Dimension]?: string } & Record<string, unknown>;

const DIM_LABEL: Record<Dimension, [string, string]> = {
  sector: ["Sector", "Qaybta"],
  mda: ["MDA", "Hay'adda"],
  category: ["Budget category", "Qaybta miisaaniyadda"],
  item: ["Economic item", "Shayga dhaqaalaha"],
  code: ["Classification code", "Koodhka"],
  kind: ["Revenue / expenditure", "Dakhli / kharash"],
};
const MEASURE_LABEL: Record<string, [string, string]> = {
  amount: ["Budget", "Miisaaniyad"],
  prior: ["Prior-year approved", "Sannadkii hore"],
  change: ["Change", "Isbeddel"],
  changePct: ["Change %", "Isbeddel %"],
  share: ["Share", "Saamiga"],
  budget: ["Revised budget", "Miisaaniyadda la beddelay"],
  actual: ["Actual", "Dhab"],
  committed: ["Committed", "Ballanqaaday"],
  available: ["Available", "La heli karo"],
  rate: ["Execution %", "Fulinta %"],
};

export function dimensionLabel(d: string, locale: Locale) {
  const l = DIM_LABEL[d as Dimension];
  return l ? l[locale === "so" ? 1 : 0] : d;
}
export function measureLabel(m: string, locale: Locale) {
  const l = MEASURE_LABEL[m];
  return l ? l[locale === "so" ? 1 : 0] : m;
}

async function budgetDetails(actor: Actor, c: BuilderConfig, year: number, dataset: "effective" | "approved", locale: Locale) {
  const en = locale === "en";
  const rows = await prisma.$queryRaw<{ sectorid: string; sector: string; sectoren: string | null; mdaid: string; mdacode: string; mdaname: string; mdaen: string | null; catid: string | null; catname: string | null; catso: string | null; kind: string; code: string; codename: string; codeen: string | null; itemcode: string | null; itemname: string | null; itemen: string | null; amount: string }[]>`
    WITH ${effectiveCte(actor, [year], { dataset, mdaId: c.mdaId ?? undefined, sectorId: c.sectorId ?? undefined })}
    SELECT s.id AS sectorid, s.code || ' ' || s.name AS sector, s.code || ' ' || COALESCE(s."nameEn", s.name) AS sectoren,
      m.id AS mdaid, m.code AS mdacode, m.name AS mdaname, m."nameEn" AS mdaen,
      c.id AS catid, c.name AS catname, c."nameSo" AS catso, bc.kind::text AS kind,
      bc.code, bc.name AS codename, bc."nameEn" AS codeen, a.code AS itemcode, a.name AS itemname, a."nameEn" AS itemen,
      SUM(l.amount)::text AS amount
    FROM eff e
    JOIN budget_lines l ON l."submissionId" = e.id
    JOIN budget_codes bc ON bc.id = l."budgetCodeId"
    JOIN mdas m ON m.id = e."mdaId"
    JOIN sectors s ON s.id = m."sectorId"
    LEFT JOIN budget_categories c ON c.id = bc."categoryId"
    LEFT JOIN budget_codes a ON a.kind = bc.kind AND (bc.path = a.path OR bc.path LIKE a.path || '/%') AND a.level = LEAST(bc.level, 4)
    WHERE TRUE
      ${c.kind !== "ALL" ? Prisma.sql`AND l.kind = ${c.kind}::"BudgetKind"` : Prisma.empty}
      ${c.categoryId ? Prisma.sql`AND bc."categoryId" = ${c.categoryId}` : Prisma.empty}
      ${c.codePrefix ? Prisma.sql`AND bc.code LIKE ${c.codePrefix + "%"}` : Prisma.empty}
    GROUP BY s.id, s.code, s.name, s."nameEn", m.id, m.code, m.name, m."nameEn", c.id, c.name, c."nameSo", bc.kind, bc.code, bc.name, bc."nameEn", a.code, a.name, a."nameEn"`;
  return rows.map((r) => ({
    sectorId: r.sectorid,
    sector: en ? (r.sectoren ?? r.sector) : r.sector,
    mdaId: r.mdaid,
    mda: `${r.mdacode} ${en && r.mdaen ? r.mdaen : r.mdaname}`,
    categoryId: r.catid ?? "none",
    category: r.catname ? (en ? r.catname : (r.catso ?? r.catname)) : en ? "Unclassified" : "Aan la kala saarin",
    item: r.itemcode ? `${r.itemcode} ${en && r.itemen ? r.itemen : r.itemname}` : `${r.code} ${en && r.codeen ? r.codeen : r.codename}`,
    code: `${r.code} ${en && r.codeen ? r.codeen : r.codename}`,
    kind: r.kind === "REVENUE" ? (en ? "Revenue" : "Dakhli") : en ? "Expenditure" : "Kharash",
    amount: Number(r.amount),
  }));
}

async function details(actor: Actor, c: BuilderConfig, locale: Locale): Promise<Detail[]> {
  const blank = { amount: 0, prior: 0, budget: 0, actual: 0, committed: 0, available: 0 };
  if (c.source === "budget") {
    const needPrior = c.measures.some((m) => m === "prior" || m === "change" || m === "changePct");
    const [cur, prev] = await Promise.all([budgetDetails(actor, c, c.year, c.dataset, locale), needPrior ? budgetDetails(actor, c, c.year - 1, "approved", locale) : Promise.resolve([])]);
    return [...cur.map((d) => ({ ...blank, ...d })), ...prev.map((d) => ({ ...blank, ...d, amount: 0, prior: d.amount }))];
  }
  // Execution source: published allocations vs actuals.
  const kinds = c.kind === "ALL" ? (["EXPENDITURE", "REVENUE"] as const) : ([c.kind] as const);
  const lines = (await Promise.all(kinds.map((k) => executionLines(actor, { year: c.year, kind: k, mdaId: c.mdaId ?? undefined, sectorId: c.sectorId ?? undefined })))).flatMap((ls, i) => ls.map((l) => ({ ...l, kind: kinds[i] })));
  const codes = await prisma.budgetCode.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.codeId))] } }, select: { id: true, path: true, kind: true, categoryId: true, category: { select: { name: true, nameSo: true } } } });
  const ancestorsPaths = [...new Set(codes.map((cd) => cd.path.split("/").slice(0, 4).join("/")))];
  const [items, mdas] = await Promise.all([
    prisma.budgetCode.findMany({ where: { path: { in: ancestorsPaths } }, select: { path: true, kind: true, code: true, name: true, nameEn: true } }),
    prisma.mda.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.mdaId))] } }, select: { id: true, sector: { select: { id: true, code: true, name: true, nameEn: true } } } }),
  ]);
  const en = locale === "en";
  return lines
    .filter((l) => (!c.codePrefix || l.code.startsWith(c.codePrefix)) && (!c.categoryId || codes.find((cd) => cd.id === l.codeId)?.categoryId === c.categoryId))
    .map((l) => {
      const code = codes.find((cd) => cd.id === l.codeId);
      const item = code ? items.find((i) => i.kind === code.kind && i.path === code.path.split("/").slice(0, 4).join("/")) : undefined;
      const sector = mdas.find((m) => m.id === l.mdaId)?.sector;
      return {
        ...blank,
        sectorId: sector?.id ?? "",
        sector: sector ? `${sector.code} ${en && sector.nameEn ? sector.nameEn : sector.name}` : "",
        mdaId: l.mdaId,
        mda: `${l.mdaCode} ${l.mdaName}`,
        categoryId: code?.categoryId ?? "none",
        category: code?.category ? (en ? code.category.name : code.category.nameSo) : en ? "Unclassified" : "Aan la kala saarin",
        item: item ? `${item.code} ${en && item.nameEn ? item.nameEn : item.name}` : `${l.code} ${l.codeName}`,
        code: `${l.code} ${l.codeName}`,
        kind: l.kind === "REVENUE" ? (en ? "Revenue" : "Dakhli") : en ? "Expenditure" : "Kharash",
        budget: l.revised,
        actual: l.actual,
        committed: l.committed,
        available: l.available,
      };
    });
}

export async function runBuilder(actor: Actor, config: BuilderConfig, locale: Locale, title?: string): Promise<ReportResult> {
  if (!can(actor, "reports.view")) throw new AuthorizationError();
  if (config.source === "execution" && !can(actor, "execution.view")) throw new AuthorizationError("You do not have access to execution data.");
  const allowed: readonly string[] = config.source === "budget" ? BUDGET_MEASURES : EXECUTION_MEASURES;
  const measures = config.measures.filter((m) => allowed.includes(m));
  const data = await details(actor, config, locale);
  const groups = new Map<string, Row>();
  for (const d of data) {
    const key = config.groupBy.map((g) => d[g]).join("\u0001");
    const row = groups.get(key) ?? (Object.fromEntries([...config.groupBy.map((g) => [g, d[g]]), ["amount", 0], ["prior", 0], ["budget", 0], ["actual", 0], ["committed", 0], ["available", 0]]) as Row);
    for (const m of ["amount", "prior", "budget", "actual", "committed", "available"] as const) row[m] = toAmount(Number(row[m]) + d[m]);
    groups.set(key, row);
  }
  const base = config.source === "budget" ? "amount" : "budget";
  const grand = toAmount([...groups.values()].reduce((s, r) => s + Number(r[base]), 0));
  let rows = [...groups.values()].map((r) => {
    const ch = calculateChange(Number(r.amount), Number(r.prior));
    return { ...r, change: ch.amount, changePct: ch.percent, share: calculateShare(Number(r[base]), grand), rate: calculateExecutionRate(Number(r.actual), Number(r.budget)) };
  });
  const sortKey = config.sortBy;
  const dir = config.sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = (a as Record<string, unknown>)[sortKey];
    const y = (b as Record<string, unknown>)[sortKey];
    if (typeof x === "number" || typeof y === "number") return dir * ((Number(x ?? -Infinity) || 0) - (Number(y ?? -Infinity) || 0));
    return dir * String(x ?? "").localeCompare(String(y ?? ""));
  });
  const totalRows = rows.length;
  if (config.limit) rows = rows.slice(0, config.limit);
  const sumOf = (k: string) => toAmount(rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[k] ?? 0), 0));
  const totals: Record<string, unknown> = { [config.groupBy[0]]: locale === "so" ? "Wadarta" : "Total" };
  for (const m of measures) {
    if (m === "changePct") totals[m] = calculateChange(sumOf("amount"), sumOf("prior")).percent;
    else if (m === "rate") totals[m] = calculateExecutionRate(sumOf("actual"), sumOf("budget"));
    else if (m === "share") totals[m] = calculateShare(sumOf(base), grand);
    else totals[m] = sumOf(m);
  }
  const columns: ReportColumn[] = [
    ...config.groupBy.map((g) => ({ key: g, label: dimensionLabel(g, locale), type: "text" as const })),
    ...measures.map((m) => ({ key: m, label: m === "amount" ? `${measureLabel(m, locale)} ${config.year}` : m === "prior" ? `${measureLabel(m, locale)} ${config.year - 1}` : measureLabel(m, locale), type: (m === "changePct" || m === "share" || m === "rate" ? "percent" : "money") as ReportColumn["type"] })),
  ];
  const L = (en: string, so: string) => (locale === "so" ? so : en);
  return {
    title: title ?? L("Custom report", "Warbixin gaar ah"),
    subtitle: `${config.source === "budget" ? L("Budget data", "Xogta miisaaniyadda") : L("Execution data", "Xogta fulinta")} · ${config.year}`,
    filters: [
      `${L("Year", "Sannad")}: ${config.year}`,
      config.kind === "ALL" ? L("Revenue and expenditure", "Dakhli iyo kharash") : config.kind === "REVENUE" ? L("Revenue", "Dakhli") : L("Expenditure", "Kharash"),
      ...(config.source === "budget" ? [config.dataset === "approved" ? L("Approved budgets only", "Miisaaniyadaha la ansixiyey oo keliya") : L("Latest approved budget or proposal", "Miisaaniyadda ugu dambeysay ama soo jeedinta")] : []),
      ...(config.codePrefix ? [`${L("Codes starting with", "Koodhadka ku bilaabma")} ${config.codePrefix}`] : []),
      `${L("Grouped by", "Kooxaysan")}: ${config.groupBy.map((g) => dimensionLabel(g, locale)).join(" › ")}`,
    ],
    sections: [{ columns, rows: rows as Record<string, unknown>[], totals }],
    notes: config.limit && totalRows > rows.length ? [L(`Showing ${rows.length} of ${totalRows} rows (limit ${config.limit}).`, `Waxaa la muujinayaa ${rows.length} ka mid ah ${totalRows}.`)] : undefined,
    landscape: columns.length > 6,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved configurations
// ─────────────────────────────────────────────────────────────────────────────

export function encodeConfig(c: BuilderConfig): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeConfig(raw: string | undefined): BuilderConfig | null {
  if (!raw) return null;
  try {
    const parsed = builderConfigSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listSavedReports(actor: Actor) {
  return prisma.savedReport.findMany({ where: { OR: [{ ownerId: actor.id }, { isShared: true }] }, orderBy: { updatedAt: "desc" }, include: { owner: { select: { fullName: true } } } });
}

export async function getSavedReport(actor: Actor, id: string) {
  const r = await prisma.savedReport.findUnique({ where: { id } });
  if (!r || (r.ownerId !== actor.id && !r.isShared)) throw new NotFoundError("saved report");
  const config = builderConfigSchema.safeParse(r.config);
  if (!config.success) throw new NotFoundError("saved report");
  return { ...r, config: config.data };
}

export async function saveReport(actor: Actor, input: { id: string | null; name: string; description: string | null; isShared: boolean; config: BuilderConfig }) {
  if (!can(actor, "reports.build")) throw new AuthorizationError("You do not have permission to save custom reports.");
  return prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.savedReport.findUnique({ where: { id: input.id } });
      if (!existing) throw new NotFoundError("saved report");
      if (existing.ownerId !== actor.id) throw new AuthorizationError("Only the owner can change a saved report. Save it under a new name instead.");
      const r = await tx.savedReport.update({ where: { id: input.id }, data: { name: input.name, description: input.description, isShared: input.isShared, config: input.config as object } });
      await audit(tx, actor, { action: "UPDATE", entityType: "SavedReport", entityId: r.id, summary: `Updated saved report "${r.name}"` });
      return r;
    }
    const r = await tx.savedReport.create({ data: { name: input.name, description: input.description, isShared: input.isShared, config: input.config as object, ownerId: actor.id } });
    await audit(tx, actor, { action: "CREATE", entityType: "SavedReport", entityId: r.id, summary: `Saved report "${r.name}"${input.isShared ? " (shared)" : ""}` });
    return r;
  });
}

export async function deleteSavedReport(actor: Actor, id: string) {
  const r = await prisma.savedReport.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("saved report");
  if (r.ownerId !== actor.id && !can(actor, "admin.settings.manage")) throw new AuthorizationError("Only the owner can delete a saved report.");
  await prisma.$transaction(async (tx) => {
    await tx.savedReport.delete({ where: { id } });
    await audit(tx, actor, { action: "DELETE", entityType: "SavedReport", entityId: id, summary: `Deleted saved report "${r.name}"` });
  });
}

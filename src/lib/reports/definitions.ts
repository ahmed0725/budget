/**
 * The Reporting Center catalogue (spec §41): 15 standard reports. Every report reads
 * through the analytics/execution services, so MDA scope and approved-only access are
 * enforced exactly as on the pages.
 */
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can, mdaScope, visibleStatuses, type Actor } from "@/lib/auth/actor";
import type { PermissionKey } from "@/lib/auth/permissions";
import { calculateChange, calculateExecutionRate, calculatePercent, calculateShare, toAmount } from "@/lib/calculations";
import { prisma } from "@/lib/db";
import { MONTH_NAMES } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { budgetByCategory, budgetByCodeLevel, budgetByMda, budgetByMdaGroup, effectiveSubmissions, executionByMda, executionSummary, expenditureMonthly, yearTotals } from "@/lib/services/analytics";
import { listAuditLogs } from "@/lib/services/audit-log";
import { executionLines } from "@/lib/services/execution";
import type { ReportColumn, ReportFilterKey, ReportGroup, ReportParams, ReportResult, ReportSection } from "./types";

type Text = { en: string; so: string };

export interface ReportContext {
  locale: Locale;
  /** Pick the text for the current language. */
  L: (en: string, so: string) => string;
  /** Translated label of a workflow/record status. */
  status: (status: string) => string;
}

export interface ReportDefinition {
  key: string;
  groups: ReportGroup[];
  title: Text;
  description: Text;
  permissions: PermissionKey[];
  filters: ReportFilterKey[];
  defaultYear: "preparation" | "execution";
  run(actor: Actor, p: ReportParams, ctx: ReportContext): Promise<ReportResult>;
}

const sum = <T>(rows: T[], f: (r: T) => number) => toAmount(rows.reduce((s, r) => s + (f(r) || 0), 0));
const col = (key: string, label: string, type: ReportColumn["type"] = "text"): ReportColumn => ({ key, label, type });

async function describeFilters(p: ReportParams, keys: ReportFilterKey[], ctx: ReportContext): Promise<string[]> {
  const out: string[] = [];
  const { L } = ctx;
  if (keys.includes("year")) out.push(`${L("Year", "Sannad")}: ${p.year}`);
  if (keys.includes("compareYear")) out.push(`${L("Compared with", "Loo barbar dhigay")}: ${p.compareYear}`);
  if (keys.includes("dataset")) out.push(p.dataset === "approved" ? L("Approved budgets only", "Miisaaniyadaha la ansixiyey oo keliya") : L("Latest approved budget or proposal", "Miisaaniyadda ugu dambeysay ee la ansixiyey ama soo jeedinta"));
  if (p.sectorId) {
    const s = await prisma.sector.findUnique({ where: { id: p.sectorId } });
    if (s) out.push(`${L("Sector", "Qaybta")}: ${s.code} ${ctx.locale === "en" && s.nameEn ? s.nameEn : s.name}`);
  }
  if (p.mdaId) {
    const m = await prisma.mda.findUnique({ where: { id: p.mdaId } });
    if (m) out.push(`${L("MDA", "Hay'adda")}: ${m.code} ${ctx.locale === "en" && m.nameEn ? m.nameEn : m.name}`);
  }
  if (p.status) out.push(`${L("Status", "Xaaladda")}: ${p.status}`);
  if (p.from || p.to) out.push(`${L("Period", "Muddada")}: ${p.from ?? "…"} – ${p.to ?? "…"}`);
  if (p.action) out.push(`${L("Action", "Ficilka")}: ${p.action}`);
  return out;
}

const mdaName = (m: { code: string; name: string; nameEn: string | null }, locale: Locale) => `${m.code} ${locale === "en" && m.nameEn ? m.nameEn : m.name}`;
const codeName = (c: { code: string; name: string; nameEn: string | null }, locale: Locale) => (locale === "en" && c.nameEn ? c.nameEn : c.name);

// ─────────────────────────────────────────────────────────────────────────────

const budgetSummary: ReportDefinition = {
  key: "budget-summary",
  groups: ["budget"],
  title: { en: "Budget Summary Report", so: "Warbixinta Soo Koobidda Miisaaniyadda" },
  description: { en: "Revenue, expenditure and balance with the composition of spending, by category and sector, compared with the previous approved budget.", so: "Dakhliga, kharashka iyo isu-dheellitirka, qaybaha iyo qaybaha dowladda, marka loo barbar dhigo miisaaniyaddii hore." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const opts = { dataset: p.dataset, sectorId: p.sectorId, mdaId: p.mdaId };
    const [[cur], [prev], cats, mdas] = await Promise.all([
      yearTotals(actor, [p.year], opts),
      yearTotals(actor, [p.year - 1], { ...opts, dataset: "approved" }),
      budgetByCategory(actor, p.year, opts),
      budgetByMda(actor, p.year, opts),
    ]);
    const line = (label: string, a: number, b: number) => ({ item: label, prior: a, current: b, change: calculateChange(b, a).amount, pct: calculateChange(b, a).percent });
    const overview = [
      line(L("Total revenue", "Wadarta dakhliga"), prev.revenue, cur.revenue),
      line(L("Total expenditure", "Wadarta kharashka"), prev.expenditure, cur.expenditure),
      line(`  ${L("Personnel", "Shaqaalaha")}`, prev.personnel, cur.personnel),
      line(`  ${L("Other recurrent", "Kharashyada kale ee joogtada ah")}`, prev.recurrent - prev.personnel, cur.recurrent - cur.personnel),
      line(`  ${L("Capital", "Raasamaal")}`, prev.capital, cur.capital),
      line(L("Balance (revenue − expenditure)", "Isu-dheellitirka (dakhli − kharash)"), prev.revenue - prev.expenditure, cur.revenue - cur.expenditure),
    ];
    const sectors = new Map<string, { sector: string; expenditure: number; revenue: number; mdas: number }>();
    for (const m of mdas) {
      const s = sectors.get(m.sectorId) ?? { sector: locale === "en" && m.sectorEn ? m.sectorEn : m.sector, expenditure: 0, revenue: 0, mdas: 0 };
      s.expenditure = toAmount(s.expenditure + m.expenditure);
      s.revenue = toAmount(s.revenue + m.revenue);
      s.mdas++;
      sectors.set(m.sectorId, s);
    }
    const catSection = (kind: string, title: string): ReportSection => {
      const rows = cats.filter((c) => c.kind === kind).map((c) => ({ category: locale === "en" ? c.name : c.nameSo, amount: c.amount }));
      const total = sum(rows, (r) => r.amount);
      return { title, columns: [col("category", L("Category", "Qaybta")), col("amount", L("Amount", "Qadarka"), "money"), col("share", L("Share", "Saamiga"), "percent")], rows: rows.map((r) => ({ ...r, share: calculateShare(r.amount, total) })), totals: { category: L("Total", "Wadarta"), amount: total, share: 100 } };
    };
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      summary: [
        { label: L("Revenue", "Dakhli"), value: cur.revenue, type: "money" },
        { label: L("Expenditure", "Kharash"), value: cur.expenditure, type: "money" },
        { label: L("Balance", "Isu-dheellitir"), value: toAmount(cur.revenue - cur.expenditure), type: "money" },
        { label: L("MDAs", "Hay'adaha"), value: cur.mdas, type: "number" },
      ],
      sections: [
        { title: L("Overview", "Guud ahaan"), columns: [col("item", L("Item", "Shayga")), col("prior", `${p.year - 1} ${L("approved", "la ansixiyey")}`, "money"), col("current", String(p.year), "money"), col("change", L("Change", "Isbeddel"), "money"), col("pct", L("Change %", "Isbeddel %"), "percent")], rows: overview },
        catSection("EXPENDITURE", L("Expenditure by category", "Kharashka qayb kasta")),
        catSection("REVENUE", L("Revenue by category", "Dakhliga qayb kasta")),
        {
          title: L("By sector", "Qaybaha dowladda"),
          columns: [col("sector", L("Sector", "Qaybta")), col("mdas", L("MDAs", "Hay'adaha"), "number"), col("revenue", L("Revenue", "Dakhli"), "money"), col("expenditure", L("Expenditure", "Kharash"), "money"), col("share", L("Share of expenditure", "Saamiga kharashka"), "percent")],
          rows: [...sectors.values()].map((s) => ({ ...s, share: calculateShare(s.expenditure, cur.expenditure) })),
          totals: { sector: L("Total", "Wadarta"), mdas: cur.mdas, revenue: cur.revenue, expenditure: cur.expenditure, share: 100 },
        },
      ],
    };
  },
};

async function codeComparison(actor: Actor, p: ReportParams, kind: "REVENUE" | "EXPENDITURE", level: number, ctx: ReportContext): Promise<ReportSection["rows"]> {
  const opts = { dataset: p.dataset, sectorId: p.sectorId, mdaId: p.mdaId };
  const [cur, prev] = await Promise.all([budgetByCodeLevel(actor, p.year, kind, level, opts), budgetByCodeLevel(actor, p.year - 1, kind, level, { ...opts, dataset: "approved" })]);
  const ids = new Set([...cur.map((c) => c.code), ...prev.map((c) => c.code)]);
  return [...ids]
    .sort()
    .map((code) => {
      const c = cur.find((x) => x.code === code);
      const q = prev.find((x) => x.code === code);
      const src = (c ?? q)!;
      const ch = calculateChange(c?.amount ?? 0, q?.amount ?? 0);
      return { code, name: codeName(src, ctx.locale), prior: q?.amount ?? 0, current: c?.amount ?? 0, change: ch.amount, pct: ch.percent };
    });
}

const comparisonColumns = (p: ReportParams, L: ReportContext["L"]) => [col("code", L("Code", "Koodh"), "code"), col("name", L("Description", "Faahfaahin")), col("prior", `${p.year - 1} ${L("approved", "la ansixiyey")}`, "money"), col("current", String(p.year), "money"), col("change", L("Change", "Isbeddel"), "money"), col("pct", L("Change %", "Isbeddel %"), "percent")];
const comparisonTotals = (rows: Record<string, unknown>[], L: ReportContext["L"]) => {
  const prior = sum(rows, (r) => Number(r.prior));
  const current = sum(rows, (r) => Number(r.current));
  const ch = calculateChange(current, prior);
  return { code: "", name: L("Total", "Wadarta"), prior, current, change: ch.amount, pct: ch.percent };
};

const revenueReport: ReportDefinition = {
  key: "revenue",
  groups: ["revenue", "budget"],
  title: { en: "Revenue Report", so: "Warbixinta Dakhliga" },
  description: { en: "Budgeted revenue by source and by detailed revenue code, compared with the previous approved budget.", so: "Dakhliga la miisaaniyeeyey il kasta iyo koodh kasta, marka loo barbar dhigo miisaaniyaddii hore." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const [bySource, detail] = await Promise.all([codeComparison(actor, p, "REVENUE", 3, ctx), codeComparison(actor, p, "REVENUE", 5, ctx)]);
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      sections: [
        { title: L("Revenue by source", "Dakhliga il kasta"), columns: comparisonColumns(p, L), rows: bySource, totals: comparisonTotals(bySource, L) },
        { title: L("Revenue by detailed code", "Dakhliga koodh kasta"), columns: comparisonColumns(p, L), rows: detail, totals: comparisonTotals(detail, L) },
      ],
    };
  },
};

const expenditureReport: ReportDefinition = {
  key: "expenditure",
  groups: ["expenditure", "budget"],
  title: { en: "Expenditure Report", so: "Warbixinta Kharashka" },
  description: { en: "Budgeted expenditure by economic classification (item level) and by MDA, compared with the previous approved budget.", so: "Kharashka la miisaaniyeeyey kala-soocidda dhaqaalaha iyo hay'ad kasta." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const opts = { dataset: p.dataset, sectorId: p.sectorId, mdaId: p.mdaId };
    const [items, cur, prev] = await Promise.all([codeComparison(actor, p, "EXPENDITURE", 4, ctx), budgetByMda(actor, p.year, opts), budgetByMda(actor, p.year - 1, { ...opts, dataset: "approved" })]);
    const byMda = cur.map((m) => {
      const q = prev.find((x) => x.mdaId === m.mdaId);
      const ch = calculateChange(m.expenditure, q?.expenditure ?? 0);
      return { code: m.code, name: locale === "en" && m.nameEn ? m.nameEn : m.name, prior: q?.expenditure ?? 0, current: m.expenditure, change: ch.amount, pct: ch.percent };
    });
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      sections: [
        { title: L("By economic item", "Shay dhaqaale kasta"), columns: comparisonColumns(p, L), rows: items, totals: comparisonTotals(items, L) },
        { title: L("By MDA", "Hay'ad kasta"), columns: comparisonColumns(p, L).map((c) => (c.key === "code" ? { ...c, label: L("MDA", "Hay'ad") } : c.key === "name" ? { ...c, label: L("Name", "Magac") } : c)), rows: byMda, totals: comparisonTotals(byMda, L) },
      ],
    };
  },
};

const mdaBudget: ReportDefinition = {
  key: "mda-budget",
  groups: ["budget"],
  title: { en: "MDA Budget Report", so: "Warbixinta Miisaaniyadda Hay'adaha" },
  description: { en: "Each MDA's revenue and expenditure by summary group (personnel, goods and services, capital, other) with its budget status.", so: "Dakhliga iyo kharashka hay'ad kasta iyo xaaladda miisaaniyaddeeda." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const opts = { dataset: p.dataset, sectorId: p.sectorId };
    const [mdas, groups] = await Promise.all([budgetByMda(actor, p.year, opts), budgetByMdaGroup(actor, p.year, opts)]);
    const g = (id: string, grp: string) => sum(groups.filter((x) => x.mdaId === id && x.group === grp), (x) => x.amount);
    const rows = mdas.map((m) => ({ mda: mdaName(m, locale), sector: locale === "en" && m.sectorEn ? m.sectorEn : m.sector, status: m.status, personnel: g(m.mdaId, "PERSONNEL"), goods: g(m.mdaId, "GOODS_SERVICES"), other: g(m.mdaId, "OTHER"), capital: g(m.mdaId, "CAPITAL"), expenditure: m.expenditure, revenue: m.revenue }));
    const keys = ["personnel", "goods", "other", "capital", "expenditure", "revenue"] as const;
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      sections: [
        {
          columns: [col("mda", L("MDA", "Hay'adda")), col("status", L("Status", "Xaaladda"), "status"), col("personnel", L("Personnel", "Shaqaalaha"), "money"), col("goods", L("Goods & services", "Alaab & adeeg"), "money"), col("other", L("Other recurrent", "Kale"), "money"), col("capital", L("Capital", "Raasamaal"), "money"), col("expenditure", L("Total expenditure", "Wadarta kharashka"), "money"), col("revenue", L("Revenue", "Dakhli"), "money")],
          rows,
          totals: { mda: L("Total", "Wadarta"), ...Object.fromEntries(keys.map((k) => [k, sum(rows, (r) => r[k])])) },
        },
      ],
    };
  },
};

const executionReport: ReportDefinition = {
  key: "budget-execution",
  groups: ["execution"],
  title: { en: "Budget Execution Report", so: "Warbixinta Fulinta Miisaaniyadda" },
  description: { en: "Revised budget, actual expenditure, commitments, available balance and execution rate by MDA, with monthly totals.", so: "Miisaaniyadda, kharashka dhabta ah, ballanqaadyada iyo heerka fulinta hay'ad kasta." },
  permissions: ["reports.view", "execution.view"],
  filters: ["year", "sector", "mda"],
  defaultYear: "execution",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const [summary, byMda, monthly] = await Promise.all([executionSummary(actor, p.year, { mdaId: p.mdaId, sectorId: p.sectorId }), executionByMda(actor, p.year, { mdaId: p.mdaId, sectorId: p.sectorId }), expenditureMonthly(actor, p.year, { mdaId: p.mdaId, sectorId: p.sectorId })]);
    const rows = byMda.map((m) => ({ mda: mdaName(m, locale), budget: m.budget, actual: m.actual, committed: m.committed, available: m.available, rate: m.executionRate }));
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      summary: [
        { label: L("Revised budget", "Miisaaniyadda la beddelay"), value: summary.revisedBudget, type: "money" },
        { label: L("Actual", "Dhab"), value: summary.actual, type: "money" },
        { label: L("Committed", "Ballanqaaday"), value: summary.committed, type: "money" },
        { label: L("Available", "La heli karo"), value: summary.available, type: "money" },
        { label: L("Execution rate", "Heerka fulinta"), value: summary.executionRate, type: "percent" },
      ],
      sections: [
        {
          title: L("By MDA", "Hay'ad kasta"),
          columns: [col("mda", L("MDA", "Hay'adda")), col("budget", L("Revised budget", "Miisaaniyadda"), "money"), col("actual", L("Actual", "Dhab"), "money"), col("committed", L("Committed", "Ballanqaaday"), "money"), col("available", L("Available", "La heli karo"), "money"), col("rate", L("Execution %", "Fulinta %"), "percent")],
          rows,
          totals: { mda: L("Total", "Wadarta"), budget: sum(rows, (r) => r.budget), actual: sum(rows, (r) => r.actual), committed: sum(rows, (r) => r.committed), available: sum(rows, (r) => r.available), rate: calculateExecutionRate(sum(rows, (r) => r.actual), sum(rows, (r) => r.budget)) },
        },
        {
          title: L("Monthly expenditure", "Kharashka bille"),
          columns: [col("month", L("Month", "Bil")), col("planned", L("Planned", "Qorshe"), "money"), col("actual", L("Actual", "Dhab"), "money"), col("cumPlanned", L("Cumulative planned", "Qorshaha la isku geeyey"), "money"), col("cumActual", L("Cumulative actual", "Dhabta la isku geeyey"), "money")],
          rows: monthly.map((m) => ({ month: MONTH_NAMES[locale][m.month - 1], planned: m.planned, actual: m.actual, cumPlanned: m.cumulativePlanned, cumActual: m.cumulativeActual })),
        },
      ],
    };
  },
};

const varianceReport: ReportDefinition = {
  key: "variance",
  groups: ["budget", "execution"],
  title: { en: "Variance Report", so: "Warbixinta Farqiga" },
  description: { en: "Budget proposals against the previous approved budget, and actual spending against the monthly plan, with large variances flagged.", so: "Soo jeedinta iyo miisaaniyaddii hore, iyo kharashka dhabta ah iyo qorshaha, farqiyada waaweyn la calaamadeeyey." },
  permissions: ["reports.view"],
  filters: ["year", "sector"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const settings = await import("@/lib/services/settings").then((m) => m.getSettings());
    const threshold = settings.budget.largeVariancePercent;
    const [cur, prev, exec] = await Promise.all([budgetByMda(actor, p.year, { sectorId: p.sectorId }), budgetByMda(actor, p.year - 1, { sectorId: p.sectorId, dataset: "approved" }), can(actor, "execution.view") ? executionByMda(actor, p.year, { sectorId: p.sectorId }) : Promise.resolve([])]);
    const flag = (pct: number | null) => (pct !== null && Math.abs(pct) > threshold ? L("Large", "Weyn") : "");
    const proposal = cur.map((m) => {
      const q = prev.find((x) => x.mdaId === m.mdaId);
      const ch = calculateChange(m.expenditure, q?.expenditure ?? 0);
      return { mda: mdaName(m, locale), prior: q?.expenditure ?? 0, current: m.expenditure, change: ch.amount, pct: ch.percent, flag: flag(ch.percent) };
    });
    const sections: ReportSection[] = [
      {
        title: L(`Budget ${p.year} vs approved ${p.year - 1}`, `Miisaaniyadda ${p.year} iyo tii la ansixiyey ${p.year - 1}`),
        columns: [col("mda", L("MDA", "Hay'adda")), col("prior", `${p.year - 1}`, "money"), col("current", `${p.year}`, "money"), col("change", L("Variance", "Farqi"), "money"), col("pct", L("Variance %", "Farqi %"), "percent"), col("flag", L("Flag", "Calaamad"))],
        rows: proposal,
        note: L(`MDAs without a ${p.year} budget are not listed. Variances above ${threshold}% are flagged.`, `Hay'adaha aan lahayn miisaaniyad ${p.year} lama taxin. Farqiyada ka badan ${threshold}% waa la calaamadeeyey.`),
      },
    ];
    if (exec.length) {
      sections.push({
        title: L("Actual vs plan to date", "Dhabta iyo qorshaha ilaa hadda"),
        columns: [col("mda", L("MDA", "Hay'adda")), col("budget", L("Revised budget", "Miisaaniyad"), "money"), col("planned", L("Planned to date", "Qorshe ilaa hadda"), "money"), col("actual", L("Actual", "Dhab"), "money"), col("variance", L("Actual − plan", "Dhab − qorshe"), "money"), col("pct", L("Variance %", "Farqi %"), "percent"), col("flag", L("Flag", "Calaamad"))],
        rows: exec.map((m) => {
          const v = toAmount(m.actual - m.plannedToDate);
          const pct = calculatePercent(v, m.plannedToDate);
          return { mda: mdaName(m, locale), budget: m.budget, planned: m.plannedToDate, actual: m.actual, variance: v, pct, flag: flag(pct) };
        }),
      });
    }
    return { title: `${this.title[locale]} ${p.year}`, subtitle: this.description[locale], filters: await describeFilters(p, this.filters, ctx), sections };
  },
};

async function submissionIds(actor: Actor, p: ReportParams) {
  return (await effectiveSubmissions(actor, p.year, { dataset: p.dataset, sectorId: p.sectorId, mdaId: p.mdaId })).map((s) => s.id);
}

const personnelReport: ReportDefinition = {
  key: "personnel",
  groups: ["expenditure"],
  title: { en: "Personnel Budget Report", so: "Warbixinta Miisaaniyadda Shaqaalaha" },
  description: { en: "Approved establishment, filled and vacant positions and annual personnel cost from Form E, by MDA and position.", so: "Tirada shaqaalaha la oggolaaday, kuwa buuxa iyo kharashka sannadlaha ah (Foomka E)." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const ids = await submissionIds(actor, p);
    const rows = await prisma.personnelBudget.findMany({ where: { submissionId: { in: ids } }, include: { submission: { select: { mda: { select: { code: true, name: true, nameEn: true } } } } }, orderBy: [{ submission: { mda: { code: "asc" } } }, { sortOrder: "asc" }] });
    const data = rows.map((r) => ({ mda: mdaName(r.submission.mda, locale), position: r.positionTitle, grade: r.grade ?? "", department: r.department ?? "", establishment: r.approvedEstablishment, filled: r.filledPositions, vacant: Math.max(0, r.approvedEstablishment - r.filledPositions), monthly: Number(r.monthlyCost), annual: Number(r.annualCost) }));
    const totals = { mda: L("Total", "Wadarta"), establishment: sum(data, (r) => r.establishment), filled: sum(data, (r) => r.filled), vacant: sum(data, (r) => r.vacant), annual: sum(data, (r) => r.annual) };
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      summary: [
        { label: L("Approved establishment", "Tirada la oggolaaday"), value: totals.establishment, type: "number" },
        { label: L("Filled", "Buuxa"), value: totals.filled, type: "number" },
        { label: L("Vacant", "Bannaan"), value: totals.vacant, type: "number" },
        { label: L("Annual cost", "Kharashka sannadlaha"), value: totals.annual, type: "money" },
      ],
      sections: [{ columns: [col("mda", L("MDA", "Hay'adda")), col("position", L("Position", "Jagada")), col("grade", L("Grade", "Darajada")), col("department", L("Department", "Waaxda")), col("establishment", L("Establishment", "La oggolaaday"), "number"), col("filled", L("Filled", "Buuxa"), "number"), col("vacant", L("Vacant", "Bannaan"), "number"), col("monthly", L("Monthly cost", "Kharashka bishii"), "money"), col("annual", L("Annual cost", "Kharashka sannadka"), "money")], rows: data, totals }],
      notes: data.length ? undefined : [L("No Form E personnel records for the selection.", "Ma jiraan diiwaanno shaqaale (Foomka E) oo la xushay.")],
    };
  },
};

const capitalReport: ReportDefinition = {
  key: "capital-projects",
  groups: ["expenditure"],
  title: { en: "Capital Project Report", so: "Warbixinta Mashaariicda Raasamaalka" },
  description: { en: "Capital projects with total cost, spending to date, the year's allocation, funding and status (Form F).", so: "Mashaariicda raasamaalka, kharashkooda guud, qoondada sannadka iyo xaaladda (Foomka F)." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda", "projectStatus"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const ids = await submissionIds(actor, p);
    const lines = await prisma.budgetLine.groupBy({ by: ["capitalProjectId"], where: { submissionId: { in: ids }, capitalProjectId: { not: null } }, _sum: { amount: true } });
    const scope = mdaScope(actor);
    const projects = await prisma.capitalProject.findMany({
      where: { deletedAt: null, id: { in: lines.map((l) => l.capitalProjectId!) }, ...(scope ? { mdaId: scope } : {}), ...(p.status ? { status: p.status as Prisma.CapitalProjectWhereInput["status"] } : {}) },
      include: { mda: { select: { code: true, name: true, nameEn: true } }, fundingSource: { select: { name: true, nameEn: true } } },
      orderBy: [{ mda: { code: "asc" } }, { name: "asc" }],
    });
    const data = projects.map((pr) => ({ code: pr.projectCode ?? "", project: pr.name, mda: mdaName(pr.mda, locale), location: pr.location ?? "", funding: pr.fundingSource ? (locale === "en" && pr.fundingSource.nameEn ? pr.fundingSource.nameEn : pr.fundingSource.name) : pr.fundingType, totalCost: Number(pr.totalCost), spent: Number(pr.spentToDate), allocation: Number(lines.find((l) => l.capitalProjectId === pr.id)?._sum.amount ?? 0), completion: pr.expectedCompletionDate, status: pr.status }));
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      sections: [
        {
          columns: [col("code", L("Code", "Koodh"), "code"), col("project", L("Project", "Mashruuc")), col("mda", L("MDA", "Hay'adda")), col("location", L("Location", "Goobta")), col("funding", L("Funding", "Maalgelin")), col("totalCost", L("Total cost", "Kharashka guud"), "money"), col("spent", L("Spent to date", "La isticmaalay"), "money"), col("allocation", `${L("Allocation", "Qoondada")} ${p.year}`, "money"), col("completion", L("Completion", "Dhammaystir"), "date"), col("status", L("Status", "Xaaladda"), "status")],
          rows: data,
          totals: { project: L("Total", "Wadarta"), totalCost: sum(data, (r) => r.totalCost), spent: sum(data, (r) => r.spent), allocation: sum(data, (r) => r.allocation) },
        },
      ],
    };
  },
};

const procurementReport: ReportDefinition = {
  key: "procurement",
  groups: ["expenditure"],
  title: { en: "Procurement Report", so: "Warbixinta Iibsiga" },
  description: { en: "Planned procurement by MDA with method, quarter and estimated cost (Form G), with quarterly totals.", so: "Qorshaha iibsiga hay'ad kasta, habka, rubuca iyo qiimaha (Foomka G)." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const ids = await submissionIds(actor, p);
    const plans = await prisma.procurementPlan.findMany({ where: { submissionId: { in: ids } }, include: { submission: { select: { mda: { select: { code: true, name: true, nameEn: true } } } }, procurementMethod: true, budgetCategory: true }, orderBy: [{ submission: { mda: { code: "asc" } } }, { quarter: "asc" }, { sortOrder: "asc" }] });
    const data = plans.map((r) => ({ mda: mdaName(r.submission.mda, locale), item: r.itemDescription, category: r.budgetCategory ? (locale === "en" ? r.budgetCategory.name : r.budgetCategory.nameSo) : "", method: r.procurementMethod ? (locale === "en" && r.procurementMethod.nameEn ? r.procurementMethod.nameEn : r.procurementMethod.name) : "", quarter: r.quarter, department: r.responsibleDepartment ?? "", cost: Number(r.estimatedCost) }));
    const quarters = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({ quarter: q, items: data.filter((d) => d.quarter === q).length, cost: sum(data.filter((d) => d.quarter === q), (d) => d.cost) }));
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      sections: [
        { title: L("Procurement plan", "Qorshaha iibsiga"), columns: [col("mda", L("MDA", "Hay'adda")), col("item", L("Item / service", "Shay / adeeg")), col("category", L("Category", "Qaybta")), col("method", L("Method", "Habka")), col("quarter", L("Quarter", "Rubuc")), col("department", L("Responsible", "Mas'uul")), col("cost", L("Estimated cost", "Qiimaha"), "money")], rows: data, totals: { mda: L("Total", "Wadarta"), cost: sum(data, (d) => d.cost) } },
        { title: L("By quarter", "Rubuc kasta"), columns: [col("quarter", L("Quarter", "Rubuc")), col("items", L("Items", "Shay"), "number"), col("cost", L("Estimated cost", "Qiimaha"), "money")], rows: quarters, totals: { quarter: L("Total", "Wadarta"), items: data.length, cost: sum(data, (d) => d.cost) } },
      ],
    };
  },
};

const cashFlowReport: ReportDefinition = {
  key: "cash-flow",
  groups: ["execution", "budget"],
  title: { en: "Cash Flow Report", so: "Warbixinta Socodka Lacagta" },
  description: { en: "Quarterly cash requirements by MDA (Form H) compared with the annual expenditure budget.", so: "Baahida lacageed ee rubuc kasta (Foomka H) marka loo barbar dhigo miisaaniyadda sannadlaha ah." },
  permissions: ["reports.view"],
  filters: ["year", "dataset", "sector", "mda"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const ids = await submissionIds(actor, p);
    const subs = await prisma.budgetSubmission.findMany({ where: { id: { in: ids } }, include: { mda: { select: { code: true, name: true, nameEn: true } }, cashFlow: true }, orderBy: { mda: { code: "asc" } } });
    const data = subs.map((s) => {
      const q = (k: string) => Number(s.cashFlow.find((c) => c.quarter === k)?.amount ?? 0);
      const total = toAmount(q("Q1") + q("Q2") + q("Q3") + q("Q4"));
      return { mda: mdaName(s.mda, locale), q1: q("Q1"), q2: q("Q2"), q3: q("Q3"), q4: q("Q4"), total, budget: Number(s.totalExpenditure), difference: toAmount(total - Number(s.totalExpenditure)) };
    });
    const keys = ["q1", "q2", "q3", "q4", "total", "budget", "difference"] as const;
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      sections: [{ columns: [col("mda", L("MDA", "Hay'adda")), col("q1", "Q1", "money"), col("q2", "Q2", "money"), col("q3", "Q3", "money"), col("q4", "Q4", "money"), col("total", L("Total", "Wadarta"), "money"), col("budget", L("Annual budget", "Miisaaniyadda sannadka"), "money"), col("difference", L("Difference", "Farqi"), "money")], rows: data, totals: { mda: L("Total", "Wadarta"), ...Object.fromEntries(keys.map((k) => [k, sum(data, (r) => r[k])])) } }],
      notes: [L("A difference means the quarterly forecast does not add up to the annual budget (validation rule CASH_FLOW_TOTAL).", "Farqigu wuxuu muujinayaa in saadaasha rubuc kasta aysan u dhigmin miisaaniyadda sannadka.")],
    };
  },
};

const collectionReport: ReportDefinition = {
  key: "revenue-collection",
  groups: ["revenue", "execution"],
  title: { en: "Revenue Collection Report", so: "Warbixinta Ururinta Dakhliga" },
  description: { en: "Monthly revenue collections by revenue code against the annual target, with the collection rate.", so: "Dakhliga la ururiyey bil kasta iyo koodh kasta marka loo barbar dhigo bartilmaameedka." },
  permissions: ["reports.view", "execution.view"],
  filters: ["year", "mda"],
  defaultYear: "execution",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const lines = await executionLines(actor, { year: p.year, kind: "REVENUE", mdaId: p.mdaId });
    const months = MONTH_NAMES[locale];
    const rows = lines.map((l) => ({ code: l.code, name: l.codeName, target: l.revised, ...Object.fromEntries(l.months.map((v, i) => [`m${i + 1}`, v])), actual: l.actual, rate: l.rate }));
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      sections: [
        {
          columns: [col("code", L("Code", "Koodh"), "code"), col("name", L("Revenue source", "Isha dakhliga")), col("target", L("Target", "Bartilmaameed"), "money"), ...months.map((m, i) => col(`m${i + 1}`, m, "money")), col("actual", L("Collected", "La ururiyey"), "money"), col("rate", "%", "percent")],
          rows,
          totals: { name: L("Total", "Wadarta"), target: sum(lines, (l) => l.revised), ...Object.fromEntries(months.map((_, i) => [`m${i + 1}`, sum(lines, (l) => l.months[i])])), actual: sum(lines, (l) => l.actual), rate: calculatePercent(sum(lines, (l) => l.actual), sum(lines, (l) => l.revised)) },
        },
      ],
    };
  },
};

const comparisonReport: ReportDefinition = {
  key: "budget-comparison",
  groups: ["budget"],
  title: { en: "Budget Comparison Report", so: "Warbixinta Isbarbardhigga Miisaaniyadda" },
  description: { en: "Two budget years side by side, by MDA and by category, with the change between them.", so: "Laba sannad oo miisaaniyad ah oo is barbar socda, hay'ad iyo qayb kasta." },
  permissions: ["reports.view"],
  filters: ["year", "compareYear", "dataset", "sector"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const opts = { dataset: p.dataset, sectorId: p.sectorId };
    const [a, b, ca, cb] = await Promise.all([budgetByMda(actor, p.compareYear, opts), budgetByMda(actor, p.year, opts), budgetByCategory(actor, p.compareYear, opts), budgetByCategory(actor, p.year, opts)]);
    const ids = new Set([...a, ...b].map((m) => m.mdaId));
    const mdaRows = [...ids].map((id) => {
      const x = a.find((m) => m.mdaId === id);
      const y = b.find((m) => m.mdaId === id);
      const src = (y ?? x)!;
      const ch = calculateChange(y?.expenditure ?? 0, x?.expenditure ?? 0);
      return { name: mdaName(src, locale), base: x?.expenditure ?? 0, compare: y?.expenditure ?? 0, change: ch.amount, pct: ch.percent };
    });
    const codes = new Set([...ca, ...cb].map((c) => `${c.kind}|${c.code}`));
    const catRows = [...codes].map((k) => {
      const [kind, code] = k.split("|");
      const x = ca.find((c) => c.kind === kind && c.code === code);
      const y = cb.find((c) => c.kind === kind && c.code === code);
      const src = (y ?? x)!;
      const ch = calculateChange(y?.amount ?? 0, x?.amount ?? 0);
      return { name: `${kind === "REVENUE" ? L("Revenue", "Dakhli") : L("Expenditure", "Kharash")} · ${locale === "en" ? src.name : src.nameSo}`, base: x?.amount ?? 0, compare: y?.amount ?? 0, change: ch.amount, pct: ch.percent };
    });
    const columns = [col("name", L("Name", "Magac")), col("base", String(p.compareYear), "money"), col("compare", String(p.year), "money"), col("change", L("Change", "Isbeddel"), "money"), col("pct", L("Change %", "Isbeddel %"), "percent")];
    const totals = (rows: typeof mdaRows) => {
      const base = sum(rows, (r) => r.base);
      const compare = sum(rows, (r) => r.compare);
      const ch = calculateChange(compare, base);
      return { name: L("Total", "Wadarta"), base, compare, change: ch.amount, pct: ch.percent };
    };
    return {
      title: `${this.title[locale]} ${p.compareYear}–${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      sections: [
        { title: L("Expenditure by MDA", "Kharashka hay'ad kasta"), columns, rows: mdaRows.sort((x, y) => y.compare - x.compare), totals: totals(mdaRows) },
        { title: L("By category", "Qayb kasta"), columns, rows: catRows },
      ],
    };
  },
};

const historicalReport: ReportDefinition = {
  key: "historical",
  groups: ["budget"],
  title: { en: "Historical Budget Report", so: "Warbixinta Taariikhda Miisaaniyadda" },
  description: { en: "Approved budgets of all years: government totals and each MDA's expenditure by year.", so: "Miisaaniyadaha la ansixiyey ee sannadaha oo dhan: wadarta dowladda iyo kharashka hay'ad kasta." },
  permissions: ["reports.view"],
  filters: ["sector", "mda"],
  defaultYear: "execution",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const years = (await prisma.budgetYear.findMany({ orderBy: { year: "asc" }, select: { year: true } })).map((y) => y.year);
    const totals = (await yearTotals(actor, years, { dataset: "approved", sectorId: p.sectorId, mdaId: p.mdaId })).filter((y) => y.expenditure || y.revenue);
    const perYear = await Promise.all(totals.map((y) => budgetByMda(actor, y.year, { dataset: "approved", sectorId: p.sectorId, mdaId: p.mdaId })));
    const mdas = new Map<string, Record<string, unknown>>();
    perYear.forEach((list, i) => {
      for (const m of list) {
        const row = mdas.get(m.mdaId) ?? { mda: mdaName(m, locale) };
        row[`y${totals[i].year}`] = m.expenditure;
        mdas.set(m.mdaId, row);
      }
    });
    return {
      title: this.title[locale],
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      sections: [
        {
          title: L("Government totals", "Wadarta dowladda"),
          columns: [col("year", L("Year", "Sannad")), col("revenue", L("Revenue", "Dakhli"), "money"), col("expenditure", L("Expenditure", "Kharash"), "money"), col("personnel", L("Personnel", "Shaqaalaha"), "money"), col("capital", L("Capital", "Raasamaal"), "money"), col("mdas", L("MDAs", "Hay'adaha"), "number")],
          rows: totals.map((y) => ({ ...y, year: String(y.year) })),
        },
        {
          title: L("Expenditure by MDA and year", "Kharashka hay'ad iyo sannad kasta"),
          columns: [col("mda", L("MDA", "Hay'adda")), ...totals.map((y) => col(`y${y.year}`, String(y.year), "money"))],
          rows: [...mdas.values()].sort((a, b) => String(a.mda).localeCompare(String(b.mda))),
          totals: { mda: L("Total", "Wadarta"), ...Object.fromEntries(totals.map((y) => [`y${y.year}`, y.expenditure])) },
        },
      ],
      notes: [L("Only approved (or published) budgets are included.", "Waxaa ku jira oo keliya miisaaniyadaha la ansixiyey ama la daabacay.")],
    };
  },
};

const statusReport: ReportDefinition = {
  key: "submission-status",
  groups: ["budget"],
  title: { en: "Submission Status Report", so: "Warbixinta Xaaladda Gudbinta" },
  description: { en: "Where every MDA's budget is in the workflow: status, completion, validation results and key dates. MDAs without a budget are listed.", so: "Halka ay marayso miisaaniyad kasta: xaaladda, dhammaystirka, hubinta iyo taariikhaha." },
  permissions: ["reports.view"],
  filters: ["year", "sector", "submissionStatus"],
  defaultYear: "preparation",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const scope = mdaScope(actor);
    const statuses = visibleStatuses(actor);
    const [subs, mdas] = await Promise.all([
      prisma.budgetSubmission.findMany({
        where: { budgetYear: { year: p.year }, supersededAt: null, ...(scope ? { mdaId: scope } : {}), ...(statuses ? { status: { in: statuses } } : {}), ...(p.status ? { status: p.status as Prisma.BudgetSubmissionWhereInput["status"] } : {}), ...(p.sectorId ? { mda: { sectorId: p.sectorId } } : {}) },
        include: { mda: { select: { code: true, name: true, nameEn: true } }, assignedReviewer: { select: { fullName: true } } },
        orderBy: [{ mda: { code: "asc" } }, { revisionNumber: "asc" }],
      }),
      prisma.mda.findMany({ where: { deletedAt: null, isActive: true, ...(scope ? { id: scope } : {}), ...(p.sectorId ? { sectorId: p.sectorId } : {}) }, select: { id: true, code: true, name: true, nameEn: true } }),
    ]);
    const rows = subs.map((s) => ({ mda: mdaName(s.mda, locale), type: s.type === "REVISION" ? `${L("Revision", "Dib-u-eegis")} ${s.revisionNumber}` : L("Original", "Asal"), status: s.status, completion: s.completion, errors: s.validationErrors ?? 0, warnings: s.validationWarnings ?? 0, submitted: s.submittedAt, approved: s.approvedAt, reviewer: s.assignedReviewer?.fullName ?? "", updated: s.updatedAt, expenditure: Number(s.totalExpenditure) }));
    const without = p.status ? [] : mdas.filter((m) => !subs.some((s) => s.mdaId === m.id));
    const counts = new Map<string, number>();
    for (const s of subs) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return {
      title: `${this.title[locale]} ${p.year}`,
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      summary: [...counts.entries()].map(([k, v]) => ({ label: ctx.status(k), value: v, type: "number" as const })).concat(without.length ? [{ label: L("No budget yet", "Weli miisaaniyad ma leh"), value: without.length, type: "number" as const }] : []),
      sections: [
        {
          title: L("Budgets", "Miisaaniyadaha"),
          columns: [col("mda", L("MDA", "Hay'adda")), col("type", L("Type", "Nooca")), col("status", L("Status", "Xaaladda"), "status"), col("completion", L("Completion", "Dhammaystir"), "percent"), col("errors", L("Errors", "Khaladaad"), "number"), col("warnings", L("Warnings", "Digniino"), "number"), col("submitted", L("Submitted", "La gudbiyey"), "datetime"), col("approved", L("Approved", "La ansixiyey"), "datetime"), col("reviewer", L("Reviewer", "Dib-u-eege")), col("expenditure", L("Expenditure", "Kharash"), "money")],
          rows,
          totals: { mda: L("Total", "Wadarta"), expenditure: sum(rows, (r) => r.expenditure) },
        },
        ...(without.length ? [{ title: L("MDAs without a budget", "Hay'adaha aan miisaaniyad lahayn"), columns: [col("mda", L("MDA", "Hay'adda"))], rows: without.map((m) => ({ mda: mdaName(m, locale) })) }] : []),
      ],
    };
  },
};

const auditReport: ReportDefinition = {
  key: "audit",
  groups: ["budget"],
  title: { en: "Audit Report", so: "Warbixinta Hanti-dhowrka" },
  description: { en: "Audit trail entries for a period with a summary by action and by user.", so: "Diiwaannada hanti-dhowrka muddo gaar ah iyo soo koobid ficil iyo isticmaale kasta." },
  permissions: ["reports.view", "audit.view"],
  filters: ["from", "to", "action", "mda"],
  defaultYear: "execution",
  async run(actor, p, ctx) {
    const { L, locale } = ctx;
    const { total, rows } = await listAuditLogs(actor, { from: p.from, to: p.to, action: p.action, mdaId: p.mdaId }, 1, 5000);
    const byAction = new Map<string, number>();
    const byUser = new Map<string, number>();
    for (const r of rows) {
      byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
      byUser.set(r.userName ?? "System", (byUser.get(r.userName ?? "System") ?? 0) + 1);
    }
    return {
      title: this.title[locale],
      subtitle: this.description[locale],
      filters: await describeFilters(p, this.filters, ctx),
      landscape: true,
      summary: [{ label: L("Entries", "Diiwaanno"), value: total, type: "number" }],
      sections: [
        { title: L("By action", "Ficil kasta"), columns: [col("action", L("Action", "Ficil")), col("count", L("Entries", "Diiwaanno"), "number")], rows: [...byAction.entries()].sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count })) },
        { title: L("By user", "Isticmaale kasta"), columns: [col("user", L("User", "Isticmaale")), col("count", L("Entries", "Diiwaanno"), "number")], rows: [...byUser.entries()].sort((a, b) => b[1] - a[1]).map(([user, count]) => ({ user, count })) },
        { title: L("Entries", "Diiwaannada"), columns: [col("time", L("Time", "Waqti"), "datetime"), col("user", L("User", "Isticmaale")), col("action", L("Action", "Ficil")), col("entity", L("Record", "Diiwaan")), col("summary", L("Summary", "Soo koobid")), col("ip", "IP")], rows: rows.map((r) => ({ time: r.createdAt, user: r.userName ?? "System", action: r.action, entity: r.entityType, summary: r.summary ?? "", ip: r.ip ?? "" })) },
      ],
      notes: total > rows.length ? [L(`Showing the latest ${rows.length} of ${total} entries; narrow the period to see all.`, `Waxaa la muujinayaa ${rows.length} ka mid ah ${total}; yaree muddada si aad dhammaan u aragto.`)] : undefined,
    };
  },
};

export const REPORTS: ReportDefinition[] = [
  budgetSummary,
  revenueReport,
  expenditureReport,
  mdaBudget,
  executionReport,
  varianceReport,
  personnelReport,
  capitalReport,
  procurementReport,
  cashFlowReport,
  collectionReport,
  comparisonReport,
  historicalReport,
  statusReport,
  auditReport,
];

export function reportByKey(key: string) {
  return REPORTS.find((r) => r.key === key);
}

export function reportsFor(actor: Actor) {
  return REPORTS.filter((r) => r.permissions.every((p) => can(actor, p)));
}

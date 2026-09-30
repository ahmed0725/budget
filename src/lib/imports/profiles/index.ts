/**
 * Import profile registry. Every profile turns a workbook into ParsedRows (Detect →
 * Map → Validate), resolves them against reference data and commits the valid rows.
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";
import { commitBudgetEntries, loadReferenceIndex, resolveEntries } from "../budget-commit";
import { LEGACY_SUMMARY_SCHEME } from "../reference-data";
import type { ParsedRow, ReconciliationItem } from "../types";
import type { WorkbookData } from "../workbook";
import { detectBudgetWorkbook, parseBudgetWorkbook, suggestBudgetWorkbookOptions, type BudgetWorkbookOptions } from "./budget-workbook";
import { BUDGET_LINE_FIELDS, budgetLineYears, budgetLinesOptionsSchema, interpretBudgetLines, type BudgetLinesOptions } from "./budget-lines";
import { CHART_FIELDS, chartOptionsSchema, commitChart, interpretChart, resolveChart, type ChartOptions } from "./chart-of-accounts";
import { commitExecution, executionFields, executionOptionsSchema, interpretExecution, resolveExecution, type ExecutionOptions } from "./execution";
import { detectTables, extractTable, suggestColumns, type FieldDef, type TableDetection } from "./tabular";

type Client = Tx | typeof prisma;

export type ProfileKey = "budget-workbook" | "budget-lines" | "execution-expenditure" | "execution-revenue" | "chart-of-accounts";

export interface ProfileContext {
  preparationYear: number | null;
  executionYear: number | null;
  revenueMdaCode: string;
}

export interface ParseOutput {
  rows: ParsedRow[];
  reconciliation?: ReconciliationItem[];
  notes?: Record<string, string[]>;
}

export interface ImportProfile<O = unknown> {
  key: ProfileKey;
  label: { en: string; so: string };
  description: { en: string; so: string };
  accepts: ("xlsx" | "csv")[];
  /** Table profiles: fields to map to columns. */
  fields?: FieldDef[];
  /** Rows can be corrected in the preview (table profiles). */
  correctable: boolean;
  permission: "import.run" | "execution.manage" | "admin.codes.manage";
  schema: z.ZodType<O>;
  detect(wb: WorkbookData, ctx: ProfileContext): Promise<{ detected: unknown; options: O; confidence: number }>;
  parse(wb: WorkbookData, options: O): ParseOutput;
  /** Re-run row interpretation from stored values (after corrections). */
  reinterpret?(rows: ParsedRow[], options: O): void;
  resolve(rows: ParsedRow[], client: Client, options: O): Promise<void>;
  commit(tx: Tx, actor: Actor, rows: ParsedRow[], options: O, label: string): Promise<Record<string, unknown>>;
}

function tableParse<O extends { sheet: string; headerRow: number; columns: Record<string, string> }>(wb: WorkbookData, options: O): ParsedRow[] {
  return extractTable(wb, options).map((r) => ({ sheetName: r.sheetName, rowNumber: r.rowNumber, raw: r.raw, data: { role: "line" as const, values: r.values }, issues: [], status: "VALID" as const }));
}

function bestTable(tables: TableDetection[], fields: FieldDef[]) {
  const scored = tables.map((t) => {
    const columns = suggestColumns(t.columns, fields);
    const score = fields.filter((f) => columns[f.key]).length + fields.filter((f) => f.required && columns[f.key]).length;
    return { t, columns, score };
  });
  return scored.sort((a, b) => b.score - a.score || b.t.dataRows - a.t.dataRows)[0];
}

// ─────────────────────────────────────────────────────────────────────────────

const budgetWorkbookSchema: z.ZodType<BudgetWorkbookOptions> = z.object({
  sheets: z.array(z.object({ name: z.string(), role: z.enum(["REVENUE_DETAIL", "SUMMARY", "MDA_SUMMARY", "MDA_DETAIL", "IGNORE"]) })).min(1),
  years: z.array(z.object({ year: z.number().int(), target: z.enum(["APPROVED", "DRAFT", "SKIP"]) })),
  mdaSummaryYear: z.number().int().nullable(),
  revenueMdaCode: z.string().regex(/^\d{3,10}$/, "Enter an MDA code"),
  columnCodes: z.record(z.string(), z.string()),
  codeScheme: z.string().min(1),
  createMissingCodes: z.boolean(),
  createMissingMdas: z.boolean(),
});

const budgetWorkbook: ImportProfile<BudgetWorkbookOptions> = {
  key: "budget-workbook",
  label: { en: "Government budget workbook", so: "Buugga miisaaniyadda dowladda" },
  description: {
    en: "The consolidated budget workbook (e.g. Final Draft Budget 2027.xlsx): revenue tables, the MDA summary and the per-MDA detail sheets. Imports approved historical budgets and/or draft budgets.",
    so: "Buugga miisaaniyadda guud (tusaale Final Draft Budget 2027.xlsx): shaxaha dakhliga, soo koobidda hay'adaha iyo faahfaahinta hay'ad kasta.",
  },
  accepts: ["xlsx"],
  correctable: false,
  permission: "import.run",
  schema: budgetWorkbookSchema,
  async detect(wb, ctx) {
    const detection = detectBudgetWorkbook(wb);
    const legacy = await prisma.codeMapping.findMany({ where: { scheme: LEGACY_SUMMARY_SCHEME }, select: { sourceCode: true, sourceName: true } });
    const options = suggestBudgetWorkbookOptions(wb, detection, {
      legacyNames: legacy.map((l) => ({ sourceCode: l.sourceCode, sourceName: l.sourceName ?? "" })),
      preparationYear: ctx.preparationYear,
      revenueMdaCode: ctx.revenueMdaCode,
    });
    return { detected: detection, options, confidence: detection.confidence };
  },
  parse(wb, options) {
    const r = parseBudgetWorkbook(wb, options);
    return { rows: r.rows, reconciliation: r.reconciliation, notes: r.sheetNotes };
  },
  async resolve(rows, client, options) {
    resolveEntries(rows, await loadReferenceIndex(client), options);
  },
  async commit(tx, actor, rows, options, label) {
    return { ...(await commitBudgetEntries(tx, actor, rows, { ...options, label })) };
  },
};

const budgetLines: ImportProfile<BudgetLinesOptions> = {
  key: "budget-lines",
  label: { en: "Budget lines (table)", so: "Safafka miisaaniyadda (shax)" },
  description: {
    en: "Any CSV or Excel table with one row per MDA and classification code (year, MDA, code, amount). Creates or updates draft budgets, or loads approved historical budgets.",
    so: "Shax kasta oo CSV ama Excel ah oo saf kastaa leeyahay hay'ad iyo koodh (sannad, hay'ad, koodh, qadar).",
  },
  accepts: ["xlsx", "csv"],
  fields: BUDGET_LINE_FIELDS,
  correctable: true,
  permission: "import.run",
  schema: budgetLinesOptionsSchema,
  async detect(wb, ctx) {
    const tables = detectTables(wb);
    const best = bestTable(tables, BUDGET_LINE_FIELDS);
    return {
      detected: { tables },
      confidence: best ? Math.min(1, best.score / 7) : 0,
      options: { sheet: best?.t.sheet ?? wb.sheets[0]?.name ?? "", headerRow: best?.t.headerRow ?? 1, columns: best?.columns ?? {}, year: best?.columns.year ? null : ctx.preparationYear, mdaCode: null, target: "DRAFT", createMissingCodes: false },
    };
  },
  parse(wb, options) {
    const rows = tableParse(wb, options);
    interpretBudgetLines(rows, options);
    return { rows };
  },
  reinterpret: interpretBudgetLines,
  async resolve(rows, client, options) {
    resolveEntries(rows, await loadReferenceIndex(client), { years: budgetLineYears(rows, options), createMissingCodes: options.createMissingCodes, createMissingMdas: false });
  },
  async commit(tx, actor, rows, options, label) {
    return { ...(await commitBudgetEntries(tx, actor, rows, { years: budgetLineYears(rows, options), createMissingCodes: options.createMissingCodes, createMissingMdas: false, label })) };
  },
};

function executionProfile(kind: "EXPENDITURE" | "REVENUE"): ImportProfile<ExecutionOptions> {
  const fields = executionFields(kind);
  return {
    key: kind === "EXPENDITURE" ? "execution-expenditure" : "execution-revenue",
    label: kind === "EXPENDITURE" ? { en: "Expenditure actuals (monthly)", so: "Kharashka dhabta ah (bille)" } : { en: "Revenue collections (monthly)", so: "Dakhliga la ururiyey (bille)" },
    description:
      kind === "EXPENDITURE"
        ? { en: "Monthly actual expenditure by MDA and economic code from the accounting system (year, month, MDA, code, amount).", so: "Kharashka dhabta ah ee bil kasta hay'ad iyo koodh." }
        : { en: "Monthly revenue collections by revenue code (year, month, MDA, code, amount).", so: "Dakhliga la ururiyey bil kasta iyo koodh." },
    accepts: ["xlsx", "csv"],
    fields,
    correctable: true,
    permission: "execution.manage",
    schema: executionOptionsSchema,
    async detect(wb, ctx) {
      const tables = detectTables(wb);
      const best = bestTable(tables, fields);
      return {
        detected: { tables },
        confidence: best ? Math.min(1, best.score / 7) : 0,
        options: { sheet: best?.t.sheet ?? wb.sheets[0]?.name ?? "", headerRow: best?.t.headerRow ?? 1, columns: best?.columns ?? {}, year: best?.columns.year ? null : ctx.executionYear, mdaCode: kind === "REVENUE" && !best?.columns.mdaCode ? ctx.revenueMdaCode : null, mode: "REPLACE" },
      };
    },
    parse(wb, options) {
      const rows = tableParse(wb, options);
      interpretExecution(rows, options, kind);
      return { rows };
    },
    reinterpret: (rows, options) => interpretExecution(rows, options, kind),
    resolve: (rows, client, options) => resolveExecution(rows, client, options, kind),
    commit: (tx, actor, rows, options, label) => commitExecution(tx, actor, rows, options, kind, label),
  };
}

const chartOfAccounts: ImportProfile<ChartOptions> = {
  key: "chart-of-accounts",
  label: { en: "Chart of accounts", so: "Jaantusha koodhadka" },
  description: { en: "Classification codes with names (code, name, optional English name, parent and category). Creates new codes and updates names.", so: "Koodhadka kala-soocidda iyo magacyadooda." },
  accepts: ["xlsx", "csv"],
  fields: CHART_FIELDS,
  correctable: true,
  permission: "admin.codes.manage",
  schema: chartOptionsSchema,
  async detect(wb, ctx) {
    const tables = detectTables(wb);
    const best = bestTable(tables, CHART_FIELDS);
    return {
      detected: { tables },
      confidence: best ? Math.min(1, best.score / 6) : 0,
      options: { sheet: best?.t.sheet ?? wb.sheets[0]?.name ?? "", headerRow: best?.t.headerRow ?? 1, columns: best?.columns ?? {}, kind: null, effectiveFromYear: ctx.preparationYear ?? new Date().getFullYear() },
    };
  },
  parse(wb, options) {
    const rows = tableParse(wb, options);
    interpretChart(rows, options);
    return { rows };
  },
  reinterpret: interpretChart,
  resolve: (rows, client) => resolveChart(rows, client),
  commit: (tx, actor, rows, _options, label) => commitChart(tx, actor, rows, label),
};

export const PROFILES: Record<ProfileKey, ImportProfile<never>> = {
  "budget-workbook": budgetWorkbook as unknown as ImportProfile<never>,
  "budget-lines": budgetLines as unknown as ImportProfile<never>,
  "execution-expenditure": executionProfile("EXPENDITURE") as unknown as ImportProfile<never>,
  "execution-revenue": executionProfile("REVENUE") as unknown as ImportProfile<never>,
  "chart-of-accounts": chartOfAccounts as unknown as ImportProfile<never>,
};

export const PROFILE_KEYS = Object.keys(PROFILES) as ProfileKey[];

export function getProfile(key: string): ImportProfile<unknown> {
  const p = PROFILES[key as ProfileKey];
  if (!p) throw new Error(`Unknown import type ${key}`);
  return p as unknown as ImportProfile<unknown>;
}

/**
 * Import profile: budget lines from any table (CSV or Excel) with one row per
 * (year, MDA, classification code, amount). Rows are written as draft budgets for the
 * preparation year or as approved historical budgets, using the same validation and
 * commit rules as the budget workbook import.
 */
import { z } from "zod";
import { deriveStatus, type BudgetEntry, type ParsedRow, type RowIssue } from "../types";
import { readField, type FieldDef, type FieldValue } from "./tabular";

export const BUDGET_LINE_FIELDS: FieldDef[] = [
  { key: "year", label: "Budget year", required: false, type: "year", match: [/^(year|sannad|fy)/i, /sannadka/i] },
  { key: "mdaCode", label: "MDA code", required: false, type: "code", match: [/mda|hay.?ad|agency|ministry|wasaar/i] },
  { key: "code", label: "Classification code", required: true, type: "code", match: [/^(code|koodh|madax|account|economic)/i, /code/i] },
  { key: "description", label: "Description", required: false, type: "text", match: [/desc|faah|sharax|name|magac/i] },
  { key: "amount", label: "Amount", required: true, type: "amount", match: [/amount|miisaan|budget|qadar|total/i] },
  { key: "kind", label: "Revenue / expenditure", required: false, type: "text", match: [/^(kind|type|nooc)/i] },
];

export const budgetLinesOptionsSchema = z.object({
  sheet: z.string().min(1),
  headerRow: z.number().int().min(1),
  columns: z.record(z.string(), z.string()),
  year: z.number().int().min(1990).max(2100).nullable(),
  mdaCode: z.string().regex(/^\d{3,10}$/).nullable(),
  target: z.enum(["DRAFT", "APPROVED"]),
  createMissingCodes: z.boolean(),
});
export type BudgetLinesOptions = z.infer<typeof budgetLinesOptionsSchema>;

const field = (key: string) => BUDGET_LINE_FIELDS.find((f) => f.key === key)!;

function kindOf(explicit: FieldValue, code: string | null, issues: RowIssue[]): "REVENUE" | "EXPENDITURE" | null {
  if (typeof explicit === "string" && explicit.trim()) {
    if (/^(rev|dakh|income|1$)/i.test(explicit.trim())) return "REVENUE";
    if (/^(exp|khar|spend|2$|3$)/i.test(explicit.trim())) return "EXPENDITURE";
    issues.push({ severity: "ERROR", code: "INVALID_KIND", field: "kind", message: `Revenue / expenditure: "${explicit}" is not recognised (use "Revenue" or "Expenditure")` });
    return null;
  }
  if (!code) return null;
  if (code.startsWith("1")) return "REVENUE";
  if (code.startsWith("2") || code.startsWith("3")) return "EXPENDITURE";
  issues.push({ severity: "ERROR", code: "INVALID_KIND", field: "code", message: `Code ${code} does not start with 1 (revenue), 2 or 3 (expenditure); add a revenue / expenditure column` });
  return null;
}

/** Turn extracted values into budget entries; flags in-file duplicates. Idempotent (used again after corrections). */
export function interpretBudgetLines(rows: ParsedRow[], options: BudgetLinesOptions): void {
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "IMPORTED") continue;
    const values = (row.data.values ?? {}) as Record<string, FieldValue>;
    const issues: RowIssue[] = [];
    const year = options.year ?? (readField(values, { ...field("year"), required: true }, issues) as number | null);
    const mdaCode = options.mdaCode ?? (readField(values, { ...field("mdaCode"), required: true }, issues) as string | null);
    const code = readField(values, field("code"), issues) as string | null;
    const description = readField(values, field("description"), issues) as string | null;
    const amount = readField(values, field("amount"), issues) as number | null;
    const kind = kindOf(values.kind ?? null, code, issues);
    row.issues = issues;
    row.data = { ...row.data, role: "line", code: code ?? undefined, description: description ?? undefined, mdaCode: mdaCode ?? undefined, entries: [] };
    if (issues.some((i) => i.severity === "ERROR") || year === null || !mdaCode || !code || amount === null || !kind) {
      row.status = deriveStatus(row);
      continue;
    }
    const key = `${year}|${mdaCode}|${kind}|${code}`;
    const first = seen.get(key);
    const entry: BudgetEntry = { year, kind, mdaCode, sourceCode: code, amount, description, sourceRef: `${row.sheetName}!${row.rowNumber}`, duplicateOf: first ? `row ${first}` : null };
    if (first) row.issues.push({ severity: "WARNING", code: "DUPLICATE_ROW", message: `Same year, MDA and code as row ${first}; this row is not imported (correct the code or skip the row)` });
    else seen.set(key, row.rowNumber);
    row.data.entries = [entry];
    row.status = deriveStatus(row);
  }
}

export function budgetLineYears(rows: ParsedRow[], options: BudgetLinesOptions) {
  const years = new Set<number>();
  for (const r of rows) for (const e of r.data.entries ?? []) years.add(e.year);
  return [...years].map((year) => ({ year, target: options.target }));
}

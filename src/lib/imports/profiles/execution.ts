/**
 * Import profile: monthly budget execution — expenditure actuals or revenue
 * collections — with one row per (year, month, MDA, code). Existing figures for the
 * same month are replaced (or added to, when the "add" mode is chosen).
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { toAmount } from "@/lib/calculations/money";
import type { Tx } from "@/lib/db";
import { parallel, prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import type { ParsedRow, RowIssue } from "../types";
import { readField, type FieldDef, type FieldValue } from "./tabular";

export const executionFields = (kind: "EXPENDITURE" | "REVENUE"): FieldDef[] => [
  { key: "year", label: "Budget year", required: false, type: "year", match: [/^(year|sannad|fy)/i] },
  { key: "month", label: "Month", required: true, type: "month", match: [/^(month|bil|period|date|taariikh)/i] },
  { key: "mdaCode", label: "MDA code", required: false, type: "code", match: [/mda|hay.?ad|agency|ministry|wasaar/i] },
  { key: "code", label: "Classification code", required: true, type: "code", match: [/^(code|koodh|madax|account|economic)/i, /code/i] },
  { key: "amount", label: kind === "EXPENDITURE" ? "Actual expenditure" : "Revenue collected", required: true, type: "amount", match: kind === "EXPENDITURE" ? [/actual|spent|kharash|payment|amount/i] : [/actual|collect|dakhli|amount|received/i] },
  { key: "planned", label: kind === "EXPENDITURE" ? "Planned (optional)" : "Target (optional)", required: false, type: "amount", match: kind === "EXPENDITURE" ? [/plan/i] : [/target|qorshe/i] },
  { key: "remarks", label: "Remarks", required: false, type: "text", match: [/remark|note|faallo|comment/i] },
];

export const executionOptionsSchema = z.object({
  sheet: z.string().min(1),
  headerRow: z.number().int().min(1),
  columns: z.record(z.string(), z.string()),
  year: z.number().int().min(1990).max(2100).nullable(),
  mdaCode: z.string().regex(/^\d{3,10}$/).nullable(),
  mode: z.enum(["REPLACE", "ADD"]),
});
export type ExecutionOptions = z.infer<typeof executionOptionsSchema>;

interface ExecutionData {
  year: number;
  month: number;
  mdaCode: string;
  code: string;
  amount: number;
  planned: number | null;
  remarks: string | null;
  duplicateOf?: number | null;
  mdaId?: string;
  codeId?: string;
  yearId?: string;
  existing?: number | null;
}

export function executionStatus(row: ParsedRow): ParsedRow["status"] {
  if (row.status === "IMPORTED") return "IMPORTED";
  if (row.issues.some((i) => i.severity === "ERROR")) return "ERROR";
  if ((row.data.execution as ExecutionData | undefined)?.duplicateOf) return "DUPLICATE";
  if (row.issues.some((i) => i.severity === "WARNING")) return "WARNING";
  return "VALID";
}

export function interpretExecution(rows: ParsedRow[], options: ExecutionOptions, kind: "EXPENDITURE" | "REVENUE"): void {
  const fields = executionFields(kind);
  const f = (k: string) => fields.find((x) => x.key === k)!;
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "IMPORTED") continue;
    const values = (row.data.values ?? {}) as Record<string, FieldValue>;
    const issues: RowIssue[] = [];
    const year = options.year ?? (readField(values, { ...f("year"), required: true }, issues) as number | null);
    const mdaCode = options.mdaCode ?? (readField(values, { ...f("mdaCode"), required: true }, issues) as string | null);
    const month = readField(values, f("month"), issues) as number | null;
    const code = readField(values, f("code"), issues) as string | null;
    const amount = readField(values, f("amount"), issues) as number | null;
    const planned = readField(values, f("planned"), issues) as number | null;
    const remarks = readField(values, f("remarks"), issues) as string | null;
    if (code && kind === "REVENUE" && !code.startsWith("1")) issues.push({ severity: "ERROR", code: "WRONG_KIND", field: "code", message: `Code ${code} is not a revenue code (revenue codes start with 1)` });
    if (code && kind === "EXPENDITURE" && code.startsWith("1")) issues.push({ severity: "ERROR", code: "WRONG_KIND", field: "code", message: `Code ${code} is a revenue code; use the revenue collection import` });
    row.issues = issues;
    row.data = { ...row.data, role: "line", code: code ?? undefined, mdaCode: mdaCode ?? undefined, execution: undefined };
    if (!issues.some((i) => i.severity === "ERROR") && year !== null && month !== null && mdaCode && code && amount !== null) {
      const key = `${year}|${month}|${mdaCode}|${code}`;
      const first = seen.get(key);
      if (first) issues.push({ severity: "WARNING", code: "DUPLICATE_ROW", message: `Same year, month, MDA and code as row ${first}; this row is not imported` });
      else seen.set(key, row.rowNumber);
      row.data.execution = { year, month, mdaCode, code, amount, planned, remarks, duplicateOf: first ?? null } satisfies ExecutionData;
    }
    row.status = executionStatus(row);
  }
}

type Client = Tx | typeof prisma;

export async function resolveExecution(rows: ParsedRow[], client: Client, options: ExecutionOptions, kind: "EXPENDITURE" | "REVENUE"): Promise<void> {
  const [years, mdas, codes] = await parallel(
    client,
    () => client.budgetYear.findMany({ select: { id: true, year: true, status: true } }),
    () => client.mda.findMany({ where: { deletedAt: null }, select: { id: true, code: true, isActive: true } }),
    () => client.budgetCode.findMany({ where: { kind }, select: { id: true, code: true, isActive: true, isPostable: true, effectiveFromYear: true, effectiveToYear: true } }),
  );
  const yearBy = new Map(years.map((y) => [y.year, y]));
  const mdaBy = new Map(mdas.map((m) => [m.code, m]));
  const yearIds = [...new Set(rows.map((r) => (r.data.execution as ExecutionData | undefined)?.year).filter(Boolean))].map((y) => yearBy.get(y as number)?.id).filter(Boolean) as string[];
  const [existing, allocations] = await parallel(
    client,
    () =>
      kind === "EXPENDITURE"
        ? client.expenditureExecution.findMany({ where: { budgetYearId: { in: yearIds } }, select: { budgetYearId: true, mdaId: true, budgetCodeId: true, month: true, actualAmount: true } })
        : client.revenueExecution.findMany({ where: { budgetYearId: { in: yearIds } }, select: { budgetYearId: true, mdaId: true, budgetCodeId: true, month: true, actualAmount: true } }),
    () => client.budgetAllocation.findMany({ where: { budgetYearId: { in: yearIds }, kind }, select: { budgetYearId: true, mdaId: true, budgetCodeId: true } }),
  );
  const existingBy = new Map(existing.map((e) => [`${e.budgetYearId}|${e.mdaId}|${e.budgetCodeId}|${e.month}`, Number(e.actualAmount)]));
  const allocated = new Set(allocations.map((a) => `${a.budgetYearId}|${a.mdaId}|${a.budgetCodeId}`));
  const now = new Date();
  for (const row of rows) {
    const d = row.data.execution as ExecutionData | undefined;
    if (row.status === "IMPORTED" || !d) continue;
    row.issues = row.issues.filter((i) => !i.code.startsWith("REF_"));
    const add = (severity: RowIssue["severity"], code: string, message: string) => row.issues.push({ severity, code, message });
    const year = yearBy.get(d.year);
    const mda = mdaBy.get(d.mdaCode);
    const code = codes.find((c) => c.code === d.code && c.effectiveFromYear <= d.year && (c.effectiveToYear === null || c.effectiveToYear >= d.year));
    if (!year) add("ERROR", "REF_UNKNOWN_YEAR", `Budget year ${d.year} is not set up`);
    else if (year.status === "CLOSED") add("ERROR", "REF_YEAR_CLOSED", `Budget year ${d.year} is closed; execution figures can no longer be changed`);
    else if (!["ACTIVE", "PUBLISHED"].includes(year.status)) add("ERROR", "REF_YEAR_NOT_EXECUTING", `Budget year ${d.year} is ${year.status.toLowerCase()}; actuals can be recorded once the budget is published`);
    if (!mda) add("ERROR", "REF_UNKNOWN_MDA", `Unknown MDA ${d.mdaCode}`);
    else if (!mda.isActive) add("ERROR", "REF_INACTIVE_MDA", `MDA ${d.mdaCode} is inactive`);
    if (!code) add("ERROR", "REF_UNKNOWN_CODE", `Unknown ${kind.toLowerCase()} code ${d.code} for ${d.year}`);
    else if (!code.isActive) add("ERROR", "REF_INACTIVE_CODE", `Code ${d.code} is inactive`);
    if (year && mda && code) {
      d.yearId = year.id;
      d.mdaId = mda.id;
      d.codeId = code.id;
      const prev = existingBy.get(`${year.id}|${mda.id}|${code.id}|${d.month}`);
      d.existing = prev ?? null;
      if (prev !== undefined && !d.duplicateOf) {
        add("INFO", "REF_EXISTING", options.mode === "ADD" ? `Adds to the ${prev.toLocaleString("en-US")} already recorded for this month` : `Replaces the ${prev.toLocaleString("en-US")} already recorded for this month`);
      }
      if (!allocated.has(`${year.id}|${mda.id}|${code.id}`) && kind === "EXPENDITURE") add("WARNING", "REF_UNBUDGETED", `MDA ${d.mdaCode} has no approved allocation for code ${d.code} in ${d.year}; the amount will show as unbudgeted spending`);
      if (d.year === now.getFullYear() && d.month > now.getMonth() + 1) add("WARNING", "REF_FUTURE_MONTH", `Month ${d.month} of ${d.year} has not started yet`);
    }
    row.status = executionStatus(row);
  }
}

export async function commitExecution(tx: Tx, actor: Actor, rows: ParsedRow[], options: ExecutionOptions, kind: "EXPENDITURE" | "REVENUE", label: string) {
  let created = 0;
  let updated = 0;
  let total = 0;
  const touched = new Set<string>();
  for (const row of rows) {
    const d = row.data.execution as ExecutionData | undefined;
    if (!d || !d.yearId || !d.mdaId || !d.codeId || d.duplicateOf || !(row.status === "VALID" || row.status === "WARNING")) continue;
    const where = { budgetYearId_mdaId_budgetCodeId_month: { budgetYearId: d.yearId, mdaId: d.mdaId, budgetCodeId: d.codeId, month: d.month } };
    const actual = options.mode === "ADD" ? toAmount((d.existing ?? 0) + d.amount) : d.amount;
    const common = { actualAmount: actual, remarks: d.remarks, source: "IMPORT" as const, enteredById: actor.id };
    if (kind === "EXPENDITURE") {
      await tx.expenditureExecution.upsert({
        where,
        create: { budgetYearId: d.yearId, mdaId: d.mdaId, budgetCodeId: d.codeId, month: d.month, plannedAmount: d.planned ?? 0, ...common },
        update: { ...common, ...(d.planned !== null ? { plannedAmount: d.planned } : {}) },
      });
    } else {
      await tx.revenueExecution.upsert({
        where,
        create: { budgetYearId: d.yearId, mdaId: d.mdaId, budgetCodeId: d.codeId, month: d.month, targetAmount: d.planned ?? 0, ...common },
        update: { ...common, ...(d.planned !== null ? { targetAmount: d.planned } : {}) },
      });
    }
    if (d.existing !== null && d.existing !== undefined) updated++;
    else created++;
    total = toAmount(total + d.amount);
    touched.add(`${d.year}-${String(d.month).padStart(2, "0")}`);
    row.status = "IMPORTED";
  }
  await audit(tx, actor, {
    action: "IMPORT",
    entityType: kind === "EXPENDITURE" ? "ExpenditureExecution" : "RevenueExecution",
    summary: `${kind === "EXPENDITURE" ? "Expenditure actuals" : "Revenue collections"} imported from ${label}: ${created} new, ${updated} updated, total ${total.toLocaleString("en-US")} (${[...touched].sort().join(", ")})`,
  });
  return { created, updated, total, periods: [...touched].sort() };
}

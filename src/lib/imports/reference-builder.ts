/**
 * Builds the chart of accounts and the MDA register from a government budget workbook.
 * Used by the seed (initial reference data) and by imports with
 * "create missing codes / MDAs" enabled.
 */
import { ADDITIONAL_CODES, CODE_ENGLISH, MDA_ENGLISH, NAME_OVERRIDES } from "./reference-data";
import type { ParsedRow } from "./types";
import { cellText, codeText, type WorkbookData } from "./workbook";

export interface ReferenceCode {
  code: string;
  name: string;
  nameEn: string | null;
  kind: "REVENUE" | "EXPENDITURE";
}

export interface ReferenceMda {
  code: string;
  name: string;
  nameEn: string | null;
  sectorCode: string;
}

function tidy(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

/** Most frequent spelling wins; ties keep the first seen. */
function pickName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Extract codes and MDAs from parsed workbook rows (see parseBudgetWorkbook).
 * Revenue names come from the revenue detail sheet first, then the summary sheet;
 * expenditure names from the MDA detail sheet.
 */
export function extractReference(rows: ParsedRow[], sheetRoles: { name: string; role: string }[]): { codes: ReferenceCode[]; mdas: ReferenceMda[] } {
  const roleOf = new Map(sheetRoles.map((s) => [s.name, s.role]));
  const revenueNames = new Map<string, { detail: string[]; summary: string[] }>();
  const expenditureNames = new Map<string, string[]>();
  const mdaNames = new Map<string, { summary?: string; detail?: string }>();

  for (const r of rows) {
    const role = roleOf.get(r.sheetName);
    const code = r.data.code;
    const description = r.data.description ? tidy(String(r.data.description)) : "";
    if ((role === "REVENUE_DETAIL" || role === "SUMMARY") && code && /^1\d*$/.test(code) && description) {
      const entry = revenueNames.get(code) ?? { detail: [], summary: [] };
      if (role === "REVENUE_DETAIL") {
        // The primary occurrence is the one that is not flagged as a duplicate.
        if (!r.issues.some((i) => i.code.startsWith("DUPLICATE"))) entry.detail.unshift(description);
        else entry.detail.push(description);
      } else entry.summary.push(description);
      revenueNames.set(code, entry);
    }
    if (role === "MDA_DETAIL" && code && /^\d{2,6}$/.test(code) && description && r.data.role !== "header") {
      expenditureNames.set(code, [...(expenditureNames.get(code) ?? []), description]);
    }
    if (r.data.mdaCode && r.data.mdaName && (role === "MDA_SUMMARY" || (role === "MDA_DETAIL" && r.data.role === "header"))) {
      const m = mdaNames.get(r.data.mdaCode) ?? {};
      if (role === "MDA_SUMMARY") m.summary ??= tidy(r.data.mdaName);
      else m.detail ??= tidy(r.data.mdaName);
      mdaNames.set(r.data.mdaCode, m);
    }
  }

  const codes: ReferenceCode[] = [];
  for (const [code, names] of revenueNames) {
    const name = NAME_OVERRIDES[code] ?? names.detail[0] ?? pickName(names.summary);
    codes.push({ code, name, nameEn: CODE_ENGLISH[code] ?? null, kind: "REVENUE" });
  }
  for (const [code, names] of expenditureNames) {
    codes.push({ code, name: NAME_OVERRIDES[code] ?? pickName(names), nameEn: CODE_ENGLISH[code] ?? null, kind: "EXPENDITURE" });
  }
  for (const extra of ADDITIONAL_CODES) {
    if (!codes.some((c) => c.code === extra.code && c.kind === extra.kind)) codes.push({ ...extra });
  }
  codes.sort((a, b) => (a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind.localeCompare(b.kind)));

  const mdas: ReferenceMda[] = [...mdaNames.entries()]
    .map(([code, n]) => ({ code, name: n.summary ?? n.detail ?? code, nameEn: MDA_ENGLISH[code] ?? null, sectorCode: `${code[0]}00` }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { codes, mdas };
}

/** Nearest existing ancestor by code prefix (the charts are prefix-hierarchical). */
export function findParentCode(code: string, existing: Set<string>): string | null {
  for (let len = code.length - 1; len > 0; len--) {
    const prefix = code.slice(0, len);
    if (existing.has(prefix)) return prefix;
  }
  return null;
}

/** Level in the hierarchy (1, 2, 3, 4, then 5 for six-digit codes). */
export function levelOfCode(code: string): number {
  return code.length <= 4 ? code.length : 5;
}

/** Workbook title (e.g. "DAWLADDA WAQOOYI BARI EE SOOMAALIYEED") for display in import summaries. */
export function workbookTitle(wb: WorkbookData): string | null {
  for (const sheet of wb.sheets) {
    for (const row of sheet.rows.slice(0, 4)) {
      const t = cellText(row.cells.A);
      if (t && /dowlad|dawlad|government/i.test(t)) return t;
    }
  }
  return null;
}

export { codeText };

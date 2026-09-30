/**
 * Generic tabular import support: find the header row, suggest a column → field
 * mapping from header names, and extract one value set per data row. Used by the
 * budget-lines, execution and chart-of-accounts profiles.
 */
import { parseAmount } from "@/lib/calculations/money";
import type { RowIssue } from "../types";
import { cellText, type Cell, type RowData, type SheetData, type WorkbookData } from "../workbook";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  /** How the cell is read. */
  type: "text" | "code" | "int" | "amount" | "month" | "year";
  /** Header patterns used to suggest the mapping. */
  match: RegExp[];
  hint?: string;
}

export interface TableColumn {
  col: string;
  header: string;
  samples: string[];
}

export interface TableDetection {
  sheet: string;
  headerRow: number;
  columns: TableColumn[];
  dataRows: number;
}

export interface TableOptions {
  sheet: string;
  headerRow: number;
  /** field key → column letter (or "" when not mapped). */
  columns: Record<string, string>;
}

export type FieldValue = string | number | null;

export interface ExtractedRow {
  sheetName: string;
  rowNumber: number;
  raw: Record<string, string | number | boolean | null>;
  values: Record<string, FieldValue>;
}

function rawOf(row: RowData): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [col, cell] of Object.entries(row.cells)) {
    if (cell.error) out[col] = cell.error;
    else if (cell.value instanceof Date) out[col] = cell.value.toISOString().slice(0, 10);
    else out[col] = cell.value as string | number | boolean | null;
  }
  return out;
}

/** The header row is the first row (of the first 30) with at least two text cells followed by data. */
function findHeader(sheet: SheetData): RowData | undefined {
  const candidates = sheet.rows.slice(0, 30);
  return candidates.find((r, i) => {
    const texts = Object.values(r.cells).filter((c) => typeof c.value === "string" && cellText(c).length > 0 && !/^[\d.,$()-]+$/.test(cellText(c)));
    return texts.length >= 2 && sheet.rows.slice(i + 1, i + 4).length > 0;
  });
}

export function detectTables(wb: WorkbookData): TableDetection[] {
  const out: TableDetection[] = [];
  for (const sheet of wb.sheets) {
    const header = findHeader(sheet);
    if (!header) continue;
    const after = sheet.rows.filter((r) => r.number > header.number);
    const columns = Object.entries(header.cells)
      .filter(([, c]) => cellText(c))
      .map(([col, c]) => ({ col, header: cellText(c), samples: after.slice(0, 3).map((r) => cellText(r.cells[col])).filter(Boolean) }));
    out.push({ sheet: sheet.name, headerRow: header.number, columns, dataRows: after.length });
  }
  return out.sort((a, b) => b.dataRows - a.dataRows);
}

/** Suggest a mapping by matching header texts against each field's patterns. */
export function suggestColumns(columns: TableColumn[], fields: FieldDef[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const f of fields) {
    const hit = columns.find((c) => !used.has(c.col) && f.match.some((m) => m.test(c.header)));
    out[f.key] = hit?.col ?? "";
    if (hit) used.add(hit.col);
  }
  return out;
}

export function extractTable(wb: WorkbookData, options: TableOptions): ExtractedRow[] {
  const sheet = wb.sheets.find((s) => s.name === options.sheet);
  if (!sheet) throw new Error(`Sheet "${options.sheet}" was not found in the file.`);
  const out: ExtractedRow[] = [];
  for (const row of sheet.rows) {
    if (row.number <= options.headerRow) continue;
    const values: Record<string, FieldValue> = {};
    let any = false;
    for (const [field, col] of Object.entries(options.columns)) {
      if (!col) continue;
      const cell: Cell | undefined = row.cells[col];
      if (!cell || (cell.value === null && !cell.error)) {
        values[field] = null;
        continue;
      }
      any = true;
      // Text is kept as written; code fields are normalised by readField.
      values[field] = cell.error ? `#ERROR:${cell.error}` : cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : typeof cell.value === "number" ? cell.value : cellText(cell);
    }
    if (any) out.push({ sheetName: sheet.name, rowNumber: row.number, raw: rawOf(row), values });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value readers — each returns the parsed value or adds an issue explaining the problem.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {};
[
  ["jan", "january", "janaayo"],
  ["feb", "february", "febraayo"],
  ["mar", "march", "maarso"],
  ["apr", "april", "abr", "abriil"],
  ["may", "maajo"],
  ["jun", "june", "juun"],
  ["jul", "july", "luu", "luulyo"],
  ["aug", "august", "ogo", "ogosto"],
  ["sep", "sept", "september", "seb", "sebteembar"],
  ["oct", "october", "okt", "oktoobar"],
  ["nov", "november", "nof", "nofeembar"],
  ["dec", "december", "dis", "diseembar"],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));

export function readField(values: Record<string, FieldValue>, field: FieldDef, issues: RowIssue[]): FieldValue {
  const v = values[field.key];
  const empty = v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  if (typeof v === "string" && v.startsWith("#ERROR:")) {
    issues.push({ severity: "ERROR", code: "SOURCE_ERROR", field: field.key, message: `${field.label}: the source cell contains ${v.slice(7)}` });
    return null;
  }
  if (empty) {
    if (field.required) issues.push({ severity: "ERROR", code: "REQUIRED", field: field.key, message: `${field.label} is required` });
    return null;
  }
  switch (field.type) {
    case "text":
      return String(v).trim();
    case "code": {
      const t = String(v).replace(/[`'’\s]/g, "").replace(/\.0+$/, "");
      if (!/^\d+$/.test(t)) {
        issues.push({ severity: "ERROR", code: "INVALID_CODE", field: field.key, message: `${field.label}: "${v}" is not a numeric code` });
        return null;
      }
      return t;
    }
    case "int":
    case "year": {
      const n = Number(String(v).trim());
      if (!Number.isInteger(n) || (field.type === "year" && (n < 1990 || n > 2100))) {
        issues.push({ severity: "ERROR", code: "INVALID_NUMBER", field: field.key, message: `${field.label}: "${v}" is not a valid ${field.type === "year" ? "year" : "whole number"}` });
        return null;
      }
      return n;
    }
    case "month": {
      const t = String(v).trim().toLowerCase();
      let m: number | undefined;
      if (/^\d{1,2}$/.test(t)) m = Number(t);
      else if (/^\d{4}-\d{2}(-\d{2})?$/.test(t)) m = Number(t.slice(5, 7));
      else m = MONTHS[t.replace(/\.$/, "")];
      if (!m || m < 1 || m > 12) {
        issues.push({ severity: "ERROR", code: "INVALID_MONTH", field: field.key, message: `${field.label}: "${v}" is not a month (use 1–12 or a month name)` });
        return null;
      }
      return m;
    }
    case "amount": {
      const parsed = parseAmount(v);
      if (!parsed.ok) {
        issues.push({ severity: "ERROR", code: "INVALID_AMOUNT", field: field.key, message: `${field.label}: ${parsed.error}` });
        return null;
      }
      if (parsed.value !== null && parsed.value < 0) {
        issues.push({ severity: "ERROR", code: "NEGATIVE_AMOUNT", field: field.key, message: `${field.label}: negative amounts are not allowed (${parsed.value})` });
        return null;
      }
      if (parsed.value === null && field.required) {
        issues.push({ severity: "ERROR", code: "REQUIRED", field: field.key, message: `${field.label} is required` });
      }
      return parsed.value;
    }
  }
}

/** Validate that every required field is mapped to a column (or given a fixed value). */
export function unmappedRequired(fields: FieldDef[], columns: Record<string, string>, fixed: string[] = []): string[] {
  return fields.filter((f) => f.required && !columns[f.key] && !fixed.includes(f.key)).map((f) => f.label);
}

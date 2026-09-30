/** Shared types for the Excel import pipeline (Upload → Detect → Map → Validate → Preview → Import). */

export type IssueSeverity = "ERROR" | "WARNING" | "INFO";

export interface RowIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  field?: string;
}

export type RowStatus = "VALID" | "WARNING" | "ERROR" | "DUPLICATE" | "SKIPPED" | "IMPORTED";

/** One amount to be written to the budget: (year, MDA, code) → amount. */
export interface BudgetEntry {
  year: number;
  kind: "REVENUE" | "EXPENDITURE";
  mdaCode: string;
  /** Code as it appears in the source. */
  sourceCode: string;
  /** Crosswalk scheme when the source code must be translated (e.g. legacy summary codes). */
  scheme?: string | null;
  amount: number;
  description?: string | null;
  sourceRef: string;
  /** Data origin written to the budget line (default IMPORT). */
  source?: "IMPORT" | "DEV_SEED";
  /** Filled by validation. */
  targetCodeId?: string | null;
  targetCode?: string | null;
  blocked?: string | null;
  /** Set when the same (year, MDA, code) already appears earlier in the file. */
  duplicateOf?: string | null;
}

export interface ParsedRow {
  sheetName: string;
  rowNumber: number;
  raw: Record<string, string | number | boolean | null>;
  data: {
    role: "line" | "aggregate" | "header" | "total" | "reference" | "info";
    code?: string;
    description?: string;
    mdaCode?: string;
    mdaName?: string;
    entries?: BudgetEntry[];
    amounts?: Record<string, number | null>;
    [key: string]: unknown;
  };
  issues: RowIssue[];
  status: RowStatus;
}

export interface ReconciliationItem {
  label: string;
  year: number | null;
  sourceLabel: string;
  sourceValue: number;
  compareLabel: string;
  compareValue: number;
  difference: number;
  status: "MATCH" | "DIFFERENCE";
  note?: string;
}

export interface SheetDetection {
  name: string;
  role: string;
  confidence: number;
  rowCount: number;
  notes: string[];
  years: number[];
}

export interface ImportSummaryCounts {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  duplicates: number;
  skipped: number;
  imported: number;
}

export function countRows(rows: { status: RowStatus }[]): ImportSummaryCounts {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === "VALID").length,
    warnings: rows.filter((r) => r.status === "WARNING").length,
    errors: rows.filter((r) => r.status === "ERROR").length,
    duplicates: rows.filter((r) => r.status === "DUPLICATE").length,
    skipped: rows.filter((r) => r.status === "SKIPPED").length,
    imported: rows.filter((r) => r.status === "IMPORTED").length,
  };
}

/** Derive a row's status from its issues and entries. */
export function deriveStatus(row: ParsedRow): RowStatus {
  if (row.status === "IMPORTED") return "IMPORTED";
  if (row.issues.some((i) => i.severity === "ERROR")) return "ERROR";
  const entries = row.data.entries ?? [];
  if (row.data.role === "line" && entries.length > 0 && entries.every((e) => e.blocked?.startsWith("DUPLICATE"))) return "DUPLICATE";
  if (row.data.role !== "line" || entries.length === 0 || entries.every((e) => e.blocked)) {
    return row.issues.some((i) => i.severity === "WARNING") ? "WARNING" : "SKIPPED";
  }
  if (row.issues.some((i) => i.severity === "WARNING")) return "WARNING";
  return "VALID";
}

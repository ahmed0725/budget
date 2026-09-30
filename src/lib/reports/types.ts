/**
 * Report engine types. A report produces a structured result once; the same result
 * is rendered as a web page, printed, or exported to PDF, Excel and CSV.
 */
export type ColumnType = "text" | "code" | "money" | "percent" | "number" | "date" | "datetime" | "status";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  note?: string;
}

export interface ReportResult {
  title: string;
  subtitle: string;
  /** Human-readable filter description ("Year: 2026", "MDA: 10101 …"). */
  filters: string[];
  summary?: { label: string; value: unknown; type: ColumnType }[];
  sections: ReportSection[];
  notes?: string[];
  landscape?: boolean;
}

export type ReportFilterKey = "year" | "compareYear" | "dataset" | "sector" | "mda" | "submissionStatus" | "projectStatus" | "from" | "to" | "action";

export interface ReportParams {
  year: number;
  compareYear: number;
  dataset: "effective" | "approved";
  sectorId?: string;
  mdaId?: string;
  status?: string;
  from?: string;
  to?: string;
  action?: string;
}

export type ReportGroup = "budget" | "execution" | "revenue" | "expenditure";

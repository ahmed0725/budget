/**
 * Workbook reading utilities (ExcelJS). Formulas are never trusted as data: for a
 * formula cell we read its cached result and record that it was a formula so the
 * importer can treat it as a derived (calculated) value.
 */
import ExcelJS from "exceljs";

export type CellValue = string | number | boolean | Date | null;

export interface Cell {
  value: CellValue;
  /** Formula text when the cell contains a formula. */
  formula?: string;
  /** Excel error such as #REF! */
  error?: string;
}

export interface RowData {
  number: number;
  cells: Record<string, Cell>;
}

export interface SheetData {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: RowData[];
  merges: string[];
}

export interface WorkbookData {
  sheets: SheetData[];
}

export function columnLetter(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function columnIndex(letter: string): number {
  return letter.toUpperCase().split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
}

function readCell(cell: ExcelJS.Cell): Cell {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return { value: null };
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return { value: typeof v === "string" ? v : v };
  if (v instanceof Date) return { value: v };
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      const result = o.result as unknown;
      const formula = String(o.formula ?? `shared:${o.sharedFormula}`);
      if (result && typeof result === "object" && "error" in (result as object)) return { value: null, formula, error: String((result as { error: string }).error) };
      if (result instanceof Date) return { value: result, formula };
      if (result === undefined || result === null) return { value: null, formula };
      return { value: result as CellValue, formula };
    }
    if ("richText" in o && Array.isArray(o.richText)) return { value: (o.richText as { text: string }[]).map((r) => r.text).join("") };
    if ("text" in o && "hyperlink" in o) return { value: String(o.text) };
    if ("error" in o) return { value: null, error: String(o.error) };
  }
  return { value: String(v) };
}

export async function readWorkbook(buffer: ArrayBuffer | Buffer): Promise<WorkbookData> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS types expect a Node Buffer.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  for (const ws of wb.worksheets) {
    const rows: RowData[] = [];
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Record<string, Cell> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const c = readCell(cell);
        if (c.value === null && !c.error && !c.formula) return;
        cells[columnLetter(colNumber)] = c;
        if (colNumber > maxCol) maxCol = colNumber;
      });
      if (Object.keys(cells).length) rows.push({ number: rowNumber, cells });
    });
    sheets.push({ name: ws.name, rowCount: ws.rowCount, columnCount: Math.max(maxCol, ws.columnCount), rows, merges: (ws.model as { merges?: string[] }).merges ?? [] });
  }
  return { sheets };
}

/** Read CSV text into a single-sheet workbook structure. */
export function readCsv(text: string, name = "CSV"): WorkbookData {
  const rows: RowData[] = [];
  const lines = parseCsv(text);
  let maxCol = 0;
  lines.forEach((fields, i) => {
    const cells: Record<string, Cell> = {};
    fields.forEach((f, j) => {
      if (f.trim() === "") return;
      const num = Number(f.replace(/,/g, ""));
      cells[columnLetter(j + 1)] = { value: f.trim() !== "" && !Number.isNaN(num) && /^[-+$(]?[\d,.]+\)?$/.test(f.trim()) ? num : f };
      maxCol = Math.max(maxCol, j + 1);
    });
    if (Object.keys(cells).length) rows.push({ number: i + 1, cells });
  });
  return { sheets: [{ name, rowCount: lines.length, columnCount: maxCol, rows, merges: [] }] };
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

export function cellText(cell: Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  return String(cell.value).replace(/\s+/g, " ").trim();
}

/** Normalise a classification code cell (e.g. "2222`" → "2222", 111101.0 → "111101"). */
export function codeText(cell: Cell | undefined): string {
  const t = cellText(cell).replace(/[`'’\s]/g, "");
  if (/^\d+(\.0+)?$/.test(t)) return t.replace(/\.0+$/, "");
  return t;
}

/** Years mentioned in a header cell ("Miisaniyadda Sannadka 2026" → 2026). */
export function yearInHeader(text: string): number | null {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

/** Monthly/derived columns in the source workbooks ("Qiyaas Bileedka", "Miisaniyadda Bileedka"). */
export function isMonthlyHeader(text: string): boolean {
  return /bil(eed|aha)|monthly|month/i.test(text);
}

/** Row lookup by number. */
export function rowIndex(sheet: SheetData): Map<number, RowData> {
  return new Map(sheet.rows.map((r) => [r.number, r]));
}

/** First row (within the first `limit` rows) whose text matches all patterns. */
export function findHeaderRow(sheet: SheetData, patterns: RegExp[], limit = 30): RowData | undefined {
  return sheet.rows.slice(0, limit).find((r) => {
    const text = Object.values(r.cells).map(cellText).join(" | ");
    return patterns.every((p) => p.test(text));
  });
}

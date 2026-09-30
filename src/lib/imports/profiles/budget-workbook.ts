/**
 * Import profile: government budget workbook ("Final Draft Budget" format).
 *
 * Sheet roles (see docs/excel-mapping.md):
 *  - REVENUE_DETAIL  e.g. "Shaxda 1.2" — hierarchical revenue codes with one column per year.
 *  - SUMMARY         e.g. "Shaxda 1.1" — revenue + expenditure summary; used for reconciliation only.
 *  - MDA_SUMMARY     e.g. "Shaxda 2.1" — one row per MDA, one column per summary expenditure code.
 *  - MDA_DETAIL      e.g. "10101"      — one block per MDA with detailed economic codes per year.
 *
 * Only leaf rows are imported (parent rows are totals). Parent totals are compared with
 * the sum of their detail lines and differences are reported as warnings. Formula
 * columns such as "Qiyaas Bileed" (annual / 12) are not imported: they are derived
 * values that the application recalculates.
 */
import { parseAmount, sum } from "@/lib/calculations/money";
import { LEGACY_SUMMARY_SCHEME } from "../reference-data";
import { deriveStatus, type BudgetEntry, type ParsedRow, type ReconciliationItem, type RowIssue, type SheetDetection } from "../types";
import { cellText, codeText, isMonthlyHeader, yearInHeader, type Cell, type RowData, type SheetData, type WorkbookData } from "../workbook";

export type SheetRole = "REVENUE_DETAIL" | "SUMMARY" | "MDA_SUMMARY" | "MDA_DETAIL" | "IGNORE";

export interface BudgetWorkbookOptions {
  sheets: { name: string; role: SheetRole }[];
  /** Years to import and how: APPROVED (historical approved budget), DRAFT (preparation) or SKIP. */
  years: { year: number; target: "APPROVED" | "DRAFT" | "SKIP" }[];
  /** Budget year of the MDA summary sheet. */
  mdaSummaryYear: number | null;
  /** MDA to which consolidated (government-wide) revenue is attributed. */
  revenueMdaCode: string;
  /** MDA summary: column letter → source (summary) code. */
  columnCodes: Record<string, string>;
  /** Crosswalk scheme for the MDA summary codes. */
  codeScheme: string;
  createMissingCodes: boolean;
  createMissingMdas: boolean;
}

const HEADER_CODE = /^(madax|code|koodh|kood)$/i;
const HEADER_DESC = /faah|description|sharax/i;

function rawOf(row: RowData): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [col, cell] of Object.entries(row.cells)) {
    if (cell.error) out[col] = cell.error;
    else if (cell.value instanceof Date) out[col] = cell.value.toISOString().slice(0, 10);
    else out[col] = cell.value as string | number | boolean | null;
  }
  return out;
}

function sheetText(sheet: SheetData, limit = 400): string {
  return sheet.rows
    .slice(0, limit)
    .map((r) => Object.values(r.cells).map(cellText).join(" "))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectRole(sheet: SheetData): SheetDetection {
  const notes: string[] = [];
  const text = sheetText(sheet);
  const codes = sheet.rows.map((r) => codeText(r.cells.A));
  const fiveDigit = codes.filter((c) => /^\d{5}$/.test(c)).length;
  const revenueCodes = codes.filter((c) => /^1\d{0,5}$/.test(c)).length;
  const expenditureTotal = sheet.rows.some((r) => codeText(r.cells.A) === "2" && /kharash|expend/i.test(cellText(r.cells.B)));
  const blocks = sheet.rows.filter((r) => /^\d{5}$/.test(codeText(r.cells.A)) && ["C", "D", "E"].some((c) => /miisaan|budget|20\d{2}/i.test(cellText(r.cells[c])))).length;
  const mXige = sheet.rows.filter((r) => /^m\.?\s*xige$/i.test(cellText(r.cells.A))).length;
  const yearSet = new Set<number>();
  for (const r of sheet.rows.slice(0, 1600)) {
    for (const c of Object.values(r.cells)) {
      const t = cellText(c);
      if (t.length < 80 && /miisaan|budget|sannad/i.test(t)) {
        const y = yearInHeader(t);
        if (y && !isMonthlyHeader(t)) yearSet.add(y);
      }
    }
  }
  const years = [...yearSet].sort();

  if (blocks >= 2 && mXige >= 1) {
    notes.push(`${blocks} MDA blocks detected`);
    return { name: sheet.name, role: "MDA_DETAIL", confidence: 0.95, rowCount: sheet.rows.length, notes, years };
  }
  const categoryHeaders = sheet.rows.filter((r) => /^\d{3}$/.test(codeText(r.cells.A)) && Object.values(r.cells).some((c) => /wadar|total/i.test(cellText(c)))).length;
  if (categoryHeaders >= 1 && fiveDigit >= 3) {
    notes.push(`${fiveDigit} MDA rows across ${categoryHeaders} sector group(s)`);
    return { name: sheet.name, role: "MDA_SUMMARY", confidence: 0.9, rowCount: sheet.rows.length, notes, years: years.length ? years : [...new Set((text.match(/\b20\d{2}\b/g) ?? []).map(Number))] };
  }
  if (revenueCodes >= 10 && expenditureTotal) {
    notes.push("Revenue and expenditure summary — used to reconcile totals");
    return { name: sheet.name, role: "SUMMARY", confidence: 0.85, rowCount: sheet.rows.length, notes, years };
  }
  if (revenueCodes >= 10) {
    notes.push(`${revenueCodes} revenue code rows`);
    return { name: sheet.name, role: "REVENUE_DETAIL", confidence: 0.85, rowCount: sheet.rows.length, notes, years };
  }
  return { name: sheet.name, role: "IGNORE", confidence: 0.2, rowCount: sheet.rows.length, notes: ["Structure not recognised"], years };
}

export function detectBudgetWorkbook(wb: WorkbookData) {
  const sheets = wb.sheets.map(detectRole);
  const recognised = sheets.filter((s) => s.role !== "IGNORE");
  const confidence = recognised.length === 0 ? 0 : Math.min(1, recognised.reduce((a, s) => a + s.confidence, 0) / Math.max(2, recognised.length));
  return { confidence, sheets };
}

/** Default mapping suggested after detection (the user can change it in the wizard). */
export function suggestBudgetWorkbookOptions(
  wb: WorkbookData,
  detection: ReturnType<typeof detectBudgetWorkbook>,
  ctx: { legacyNames: { sourceCode: string; sourceName: string }[]; preparationYear: number | null; revenueMdaCode?: string },
): BudgetWorkbookOptions {
  const years = new Set<number>();
  for (const s of detection.sheets) if (s.role === "REVENUE_DETAIL" || s.role === "MDA_DETAIL") s.years.forEach((y) => years.add(y));
  const mdaSummary = detection.sheets.find((s) => s.role === "MDA_SUMMARY");
  let mdaSummaryYear: number | null = null;
  const columnCodes: Record<string, string> = {};
  if (mdaSummary) {
    const sheet = wb.sheets.find((s) => s.name === mdaSummary.name)!;
    const title = sheet.rows.slice(0, 5).map((r) => Object.values(r.cells).map(cellText).join(" ")).join(" ");
    mdaSummaryYear = yearInHeader(title);
    if (mdaSummaryYear) years.add(mdaSummaryYear);
    const header = sheet.rows.find((r) => /^\d{3}$/.test(codeText(r.cells.A)));
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
    if (header) {
      for (const [col, cell] of Object.entries(header.cells)) {
        if (col === "A" || col === "B") continue;
        const label = norm(cellText(cell));
        const match = ctx.legacyNames.find((l) => norm(l.sourceName) === label) ?? ctx.legacyNames.find((l) => label && (norm(l.sourceName).startsWith(label) || label.startsWith(norm(l.sourceName))));
        if (match) columnCodes[col] = match.sourceCode;
      }
    }
  }
  const sorted = [...years].sort();
  return {
    sheets: detection.sheets.map((s) => ({ name: s.name, role: s.role as SheetRole })),
    years: sorted.map((year) => ({
      year,
      target: ctx.preparationYear && year >= ctx.preparationYear ? ("DRAFT" as const) : ("APPROVED" as const),
    })),
    mdaSummaryYear,
    revenueMdaCode: ctx.revenueMdaCode ?? "10301",
    columnCodes,
    codeScheme: LEGACY_SUMMARY_SCHEME,
    createMissingCodes: false,
    createMissingMdas: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount handling
// ─────────────────────────────────────────────────────────────────────────────

function readAmount(cell: Cell | undefined, label: string, issues: RowIssue[], opts: { derived?: boolean } = {}): number | null {
  if (!cell) return null;
  if (cell.error) {
    issues.push({ severity: opts.derived ? "WARNING" : "ERROR", code: "SOURCE_ERROR", message: `${label}: the source cell contains ${cell.error}`, field: label });
    return null;
  }
  if (cell.value === null || cell.value === undefined) return null;
  const parsed = parseAmount(cell.value);
  if (!parsed.ok) {
    issues.push({ severity: "ERROR", code: "INVALID_AMOUNT", message: `${label}: ${parsed.error}`, field: label });
    return null;
  }
  if (parsed.value !== null && parsed.value < 0) {
    issues.push({ severity: "ERROR", code: "NEGATIVE_AMOUNT", message: `${label}: negative amounts are not allowed (${parsed.value})`, field: label });
    return null;
  }
  if (cell.formula && !opts.derived && parsed.value !== null) {
    issues.push({ severity: "INFO", code: "FORMULA_VALUE", message: `${label}: calculated value of formula =${cell.formula} used`, field: label });
  }
  return parsed.value;
}

/** Map of year → column for a header row (monthly/derived columns excluded). */
function yearColumns(header: RowData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [col, cell] of Object.entries(header.cells)) {
    const t = cellText(cell);
    if (!t || isMonthlyHeader(t)) continue;
    const y = yearInHeader(t);
    if (y) out[col] = y;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical coded tables (Shaxda 1.1 / 1.2)
// ─────────────────────────────────────────────────────────────────────────────

interface CodedRow {
  row: RowData;
  section: number;
  code: string;
  description: string;
  amounts: Record<number, number | null>;
  issues: RowIssue[];
  /** Amount cells whose formula aggregates other rows (the row is a hidden subtotal). */
  aggregateFormulas: string[];
}

function parseCodedTable(sheet: SheetData, opts: { derivedParents: boolean }) {
  const rows: CodedRow[] = [];
  const headers: RowData[] = [];
  let section = -1;
  let codeCol = "A";
  let descCol = "B";
  let yearCols: Record<string, number> = {};
  for (const row of sheet.rows) {
    const cells = Object.entries(row.cells);
    const codeHeader = cells.find(([, c]) => HEADER_CODE.test(cellText(c)));
    const descHeader = cells.find(([, c]) => HEADER_DESC.test(cellText(c)));
    if (codeHeader && descHeader) {
      section++;
      codeCol = codeHeader[0];
      descCol = descHeader[0];
      yearCols = yearColumns(row);
      headers.push(row);
      continue;
    }
    if (section < 0) continue;
    const code = codeText(row.cells[codeCol]);
    if (!/^\d+$/.test(code)) continue;
    const issues: RowIssue[] = [];
    const amounts: Record<number, number | null> = {};
    const aggregateFormulas: string[] = [];
    for (const [col, year] of Object.entries(yearCols)) {
      amounts[year] = readAmount(row.cells[col], String(year), issues, { derived: opts.derivedParents });
      if (isAggregateFormula(row.cells[col]?.formula)) aggregateFormulas.push(`${col}${row.number}: =${row.cells[col]!.formula}`);
    }
    let description = cellText(row.cells[descCol]);
    // Some summary rows put the description one column to the right (e.g. final totals).
    if (!description || /^\d+(\.\d+)?$/.test(description)) description = cellText(row.cells[String.fromCharCode(descCol.charCodeAt(0) + 1)]) || description;
    rows.push({ row, section, code, description, amounts, issues, aggregateFormulas });
  }
  return { rows, headers, years: [...new Set(headers.flatMap((h) => Object.values(yearColumns(h))))].sort() };
}

/** Formulas that only aggregate or copy other cells (SUM/SUBTOTAL or "=A1+B2"): the row is a subtotal. */
export function isAggregateFormula(formula: string | undefined): boolean {
  if (!formula) return false;
  const f = formula.replace(/^=/, "").replace(/\$/g, "").trim();
  return /^(SUM|SUBTOTAL)\s*\(/i.test(f) || /^[A-Z]{1,3}\d+(\s*\+\s*[A-Z]{1,3}\d+)*$/i.test(f);
}

function isParent(code: string, sectionCodes: string[]): boolean {
  return sectionCodes.some((c) => c !== code && c.startsWith(code) && c.length > code.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseResult {
  rows: ParsedRow[];
  reconciliation: ReconciliationItem[];
  sheetNotes: Record<string, string[]>;
}

export function parseBudgetWorkbook(wb: WorkbookData, options: BudgetWorkbookOptions): ParseResult {
  const out: ParsedRow[] = [];
  const sheetNotes: Record<string, string[]> = {};
  const targetYears = new Set(options.years.filter((y) => y.target !== "SKIP").map((y) => y.year));
  const summaryTotals: { revenue: Record<number, number>; expenditure: Record<number, number>; byCode: Record<string, Record<number, number>> } = { revenue: {}, expenditure: {}, byCode: {} };

  for (const { name, role } of options.sheets) {
    const sheet = wb.sheets.find((s) => s.name === name);
    if (!sheet || role === "IGNORE") continue;
    sheetNotes[name] = [];

    if (role === "REVENUE_DETAIL" || role === "SUMMARY") {
      const table = parseCodedTable(sheet, { derivedParents: role === "SUMMARY" });
      const bySection = new Map<number, CodedRow[]>();
      for (const r of table.rows) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
      for (const [, sectionRows] of bySection) {
        const codes = sectionRows.map((r) => r.code);
        const filled = (r: CodedRow) => Object.values(r.amounts).filter((v) => v !== null && v !== 0).length;
        // Choose the primary occurrence of each code. Duplicates with compatible amounts are
        // merged (the most complete row is used); conflicting duplicates are errors.
        const primary = new Map<string, CodedRow>();
        const conflicting = new Set<CodedRow>();
        for (const code of new Set(codes)) {
          const occurrences = sectionRows.filter((r) => r.code === code);
          const withAmounts = occurrences.filter((r) => filled(r) > 0);
          if (withAmounts.length <= 1) {
            primary.set(code, withAmounts[0] ?? occurrences[0]);
            continue;
          }
          const compatible = withAmounts.every((a) =>
            withAmounts.every((b) =>
              Object.keys(a.amounts).every((y) => {
                const x = a.amounts[Number(y)];
                const z = b.amounts[Number(y)];
                return !x || !z || Math.abs(x - z) < 0.01;
              }),
            ),
          );
          if (compatible) primary.set(code, [...withAmounts].sort((a, b) => filled(b) - filled(a))[0]);
          else {
            primary.set(code, withAmounts[0]);
            withAmounts.slice(1).forEach((r) => conflicting.add(r));
          }
        }
        const isLeaf = (c: CodedRow) => !isParent(c.code, codes) && c.aggregateFormulas.length === 0;
        const leafSum = (parentCode: string, year: number) =>
          sum([...primary.values()].filter((c) => c.code.startsWith(parentCode) && c.code !== parentCode && isLeaf(c)).map((c) => c.amounts[year] ?? 0));

        for (const r of sectionRows) {
          const kind: "REVENUE" | "EXPENDITURE" = r.code.startsWith("1") ? "REVENUE" : "EXPENDITURE";
          const parsed: ParsedRow = {
            sheetName: name,
            rowNumber: r.row.number,
            raw: rawOf(r.row),
            data: { role: "line", code: r.code, description: r.description, amounts: Object.fromEntries(Object.entries(r.amounts).map(([y, v]) => [y, v])) },
            issues: [...r.issues],
            status: "VALID",
          };
          const hasAmounts = filled(r) > 0;
          const parent = isParent(r.code, codes);
          const main = primary.get(r.code)!;
          const buildEntries = () => {
            const entries: BudgetEntry[] = [];
            for (const [y, v] of Object.entries(r.amounts)) {
              const year = Number(y);
              if (v === null || v === 0 || !targetYears.has(year)) continue;
              entries.push({ year, kind, mdaCode: options.revenueMdaCode, sourceCode: r.code, amount: v, description: r.description, sourceRef: `${name}!R${r.row.number}` });
            }
            parsed.data.entries = entries;
            parsed.data.mdaCode = options.revenueMdaCode;
          };

          if (role === "SUMMARY") {
            parsed.data.role = "reference";
            parsed.issues = parsed.issues.filter((i) => i.severity !== "INFO");
            if (r.code === "1") for (const [y, v] of Object.entries(r.amounts)) summaryTotals.revenue[Number(y)] ??= v ?? 0;
            if (r.code === "2") for (const [y, v] of Object.entries(r.amounts)) summaryTotals.expenditure[Number(y)] ??= v ?? 0;
            if (kind === "EXPENDITURE" && r.code.length === 4) summaryTotals.byCode[r.code] = Object.fromEntries(Object.entries(r.amounts).map(([y, v]) => [y, v ?? 0]));
          } else if (main !== r) {
            if (conflicting.has(r)) {
              parsed.data.role = parent ? "aggregate" : "line";
              if (!parent) buildEntries();
              parsed.issues.push({
                severity: parent ? "WARNING" : "ERROR",
                code: "DUPLICATE_CODE",
                message: `Code ${r.code} also appears on row ${main.row.number} with different amounts${main.description !== r.description ? ` ("${main.description}" vs "${r.description}")` : ""} — resolve before importing`,
              });
            } else {
              parsed.data.role = "info";
              parsed.issues = parsed.issues.filter((i) => i.code !== "FORMULA_VALUE");
              parsed.issues.push(
                hasAmounts
                  ? { severity: "INFO", code: "DUPLICATE_MERGED", message: `Code ${r.code} also appears on row ${main.row.number} with the same amounts; row ${main.row.number} is used` }
                  : { severity: "INFO", code: "DUPLICATE_EMPTY", message: `Code ${r.code} repeats row ${main.row.number} without amounts — ignored` },
              );
            }
          } else if (parent || r.aggregateFormulas.length > 0) {
            parsed.data.role = "aggregate";
            if (!parent) {
              parsed.issues.push({
                severity: "WARNING",
                code: "HIDDEN_SUBTOTAL",
                message: `Treated as a subtotal and not imported: its amounts are formulas that add up other rows (${r.aggregateFormulas.join("; ")})`,
              });
            } else {
              for (const [y, v] of Object.entries(r.amounts)) {
                if (v === null) continue;
                const detail = leafSum(r.code, Number(y));
                if (Math.abs(detail - v) >= 1) {
                  parsed.issues.push({
                    severity: "WARNING",
                    code: "PARENT_TOTAL_MISMATCH",
                    message: `${y}: total ${v.toLocaleString("en-US")} differs from the sum of its detail lines ${detail.toLocaleString("en-US")} (difference ${(v - detail).toLocaleString("en-US")})`,
                  });
                }
              }
            }
            parsed.issues = parsed.issues.filter((i) => i.code !== "FORMULA_VALUE");
          } else {
            buildEntries();
            if (!hasAmounts) parsed.issues.push({ severity: "INFO", code: "NO_AMOUNTS", message: "No amounts on this row" });
          }
          if (parsed.data.role !== "line") {
            parsed.issues = parsed.issues.map((i) =>
              i.severity === "ERROR" && (i.code === "SOURCE_ERROR" || i.code === "INVALID_AMOUNT") ? { ...i, severity: "WARNING" as const, message: `${i.message} (total row — not imported)` } : i,
            );
          }
          parsed.status = deriveStatus(parsed);
          out.push(parsed);
        }
      }
      if (table.headers.length) sheetNotes[name].push(`Header row(s): ${table.headers.map((h) => h.number).join(", ")}; years: ${table.years.join(", ")}`);
    }

    if (role === "MDA_SUMMARY") {
      const year = options.mdaSummaryYear;
      let columnLabels: Record<string, string> = {};
      let totalColumn: string | null = null;
      const columnSums: Record<string, number> = {};
      for (const row of sheet.rows) {
        const a = codeText(row.cells.A);
        const b = cellText(row.cells.B);
        if (/^\d{3}$/.test(a) && Object.keys(row.cells).length > 3) {
          columnLabels = {};
          totalColumn = null;
          for (const [col, cell] of Object.entries(row.cells)) {
            if (col === "A" || col === "B") continue;
            const t = cellText(cell);
            if (/^(wadar|total)/i.test(t)) totalColumn = col;
            else if (t && !/^\d+(\.\d+)?$/.test(t)) columnLabels[col] = t;
          }
          out.push({ sheetName: name, rowNumber: row.number, raw: rawOf(row), data: { role: "header", code: a, description: b }, issues: [], status: "SKIPPED" });
          continue;
        }
        if (/^\d{5}$/.test(a)) {
          const issues: RowIssue[] = [];
          const entries: BudgetEntry[] = [];
          let rowSum = 0;
          for (const [col, label] of Object.entries(columnLabels)) {
            const cell = row.cells[col];
            const value = readAmount(cell, label, issues);
            if (cell?.formula && value !== null) {
              const infoIndex = issues.findIndex((i) => i.code === "FORMULA_VALUE" && i.field === label);
              if (infoIndex >= 0) issues.splice(infoIndex, 1);
              issues.push({ severity: "WARNING", code: "FORMULA_IN_DATA", message: `${label}: value comes from formula =${cell.formula} (${value.toLocaleString("en-US")}) — verify it is correct`, field: label });
            }
            if (value === null || value === 0) continue;
            rowSum += value;
            columnSums[col] = (columnSums[col] ?? 0) + value;
            const sourceCode = options.columnCodes[col];
            if (!sourceCode) {
              issues.push({ severity: "ERROR", code: "UNMAPPED_COLUMN", message: `Column ${col} ("${label}") is not mapped to a classification code`, field: label });
              continue;
            }
            if (year && targetYears.has(year)) {
              entries.push({ year, kind: "EXPENDITURE", mdaCode: a, sourceCode, scheme: options.codeScheme, amount: value, description: label, sourceRef: `${name}!${col}${row.number}` });
            }
          }
          if (!year) issues.push({ severity: "ERROR", code: "NO_YEAR", message: "The budget year of this sheet is not set in the mapping" });
          if (totalColumn) {
            const total = readAmount(row.cells[totalColumn], "Total", [], { derived: true });
            if (total !== null && Math.abs(total - rowSum) >= 1) {
              issues.push({ severity: "WARNING", code: "ROW_TOTAL_MISMATCH", message: `Row total ${total.toLocaleString("en-US")} differs from the sum of the columns ${rowSum.toLocaleString("en-US")} — the column values are imported` });
            }
          }
          const parsed: ParsedRow = { sheetName: name, rowNumber: row.number, raw: rawOf(row), data: { role: "line", mdaCode: a, mdaName: b, entries }, issues, status: "VALID" };
          parsed.status = deriveStatus(parsed);
          out.push(parsed);
          continue;
        }
        if (/wadar|total/i.test(b) && !a) {
          const issues: RowIssue[] = [];
          for (const [col, label] of Object.entries(columnLabels)) {
            const total = readAmount(row.cells[col], label, [], { derived: true });
            if (total !== null && Math.abs(total - (columnSums[col] ?? 0)) >= 1) {
              issues.push({ severity: "WARNING", code: "COLUMN_TOTAL_MISMATCH", message: `${label}: sheet total ${total.toLocaleString("en-US")} differs from the sum of MDA rows ${(columnSums[col] ?? 0).toLocaleString("en-US")}` });
            }
          }
          const parsed: ParsedRow = { sheetName: name, rowNumber: row.number, raw: rawOf(row), data: { role: "total", description: b }, issues, status: "SKIPPED" };
          parsed.status = deriveStatus(parsed);
          out.push(parsed);
        }
      }
      const extra = sheet.rows.filter((r) => Object.keys(r.cells).some((c) => c > (totalColumn ?? "M") && c.length === 1));
      if (extra.length) sheetNotes[name].push(`Working cells outside the table (column ${[...new Set(extra.flatMap((r) => Object.keys(r.cells).filter((c) => c > (totalColumn ?? "M") && c.length === 1)))].join(", ")}) are ignored`);
    }

    if (role === "MDA_DETAIL") {
      parseMdaDetail(sheet, options, targetYears, out, sheetNotes[name]);
    }
  }

  // ── Cross-sheet reconciliation ───────────────────────────────────────────
  const reconciliation: ReconciliationItem[] = [];
  const entries = out.flatMap((r) => r.data.entries ?? []);
  for (const [y, total] of Object.entries(summaryTotals.revenue)) {
    const year = Number(y);
    const detail = sum(entries.filter((e) => e.kind === "REVENUE" && e.year === year).map((e) => e.amount));
    if (detail === 0 && !targetYears.has(year)) continue;
    reconciliation.push(recon(`Total revenue ${year}`, year, "Summary sheet", total, "Imported revenue lines", detail));
  }
  if (options.mdaSummaryYear) {
    const year = options.mdaSummaryYear;
    const mdaTotal = sum(entries.filter((e) => e.kind === "EXPENDITURE" && e.year === year && e.scheme).map((e) => e.amount));
    if (summaryTotals.expenditure[year] !== undefined) {
      reconciliation.push(recon(`Total expenditure ${year}`, year, "Summary sheet", summaryTotals.expenditure[year], "MDA summary rows", mdaTotal));
    }
    for (const [code, byYear] of Object.entries(summaryTotals.byCode)) {
      const source = byYear[year];
      if (source === undefined) continue;
      const cols = Object.entries(options.columnCodes).filter(([, c]) => c === code).map(([col]) => col);
      const compare = sum(entries.filter((e) => e.year === year && e.scheme && e.sourceCode === code).map((e) => e.amount));
      const item = recon(`Code ${code} ${year}`, year, "Summary sheet", source, cols.length ? `MDA summary column ${cols.join(", ")}` : "MDA summary (no column)", compare);
      if (!cols.length) item.note = "No MDA summary column maps to this code; it is included in another column (e.g. \"Kharashyada kale\")";
      reconciliation.push(item);
    }
  }
  return { rows: out, reconciliation, sheetNotes };
}

function recon(label: string, year: number, sourceLabel: string, sourceValue: number, compareLabel: string, compareValue: number): ReconciliationItem {
  const difference = Math.round((sourceValue - compareValue) * 100) / 100;
  return { label, year, sourceLabel, sourceValue, compareLabel, compareValue, difference, status: Math.abs(difference) < 1 ? "MATCH" : "DIFFERENCE" };
}

function parseMdaDetail(sheet: SheetData, options: BudgetWorkbookOptions, targetYears: Set<number>, out: ParsedRow[], notes: string[]) {
  interface Block {
    header: RowData;
    mdaCode: string;
    mdaName: string;
    yearCols: Record<string, number>;
    rows: RowData[];
  }
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const row of sheet.rows) {
    const a = codeText(row.cells.A);
    const isHeader = /^\d{5}$/.test(a) && ["C", "D", "E"].some((c) => /miisaan|budget|20\d{2}/i.test(cellText(row.cells[c])));
    if (isHeader) {
      current = { header: row, mdaCode: a, mdaName: cellText(row.cells.B), yearCols: yearColumns(row), rows: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.rows.push(row);
    else out.push({ sheetName: sheet.name, rowNumber: row.number, raw: rawOf(row), data: { role: "header" }, issues: [], status: "SKIPPED" });
  }

  // Majority year per column across blocks, used to resolve ambiguous headers.
  const votes: Record<string, Record<number, number>> = {};
  for (const b of blocks) for (const [col, y] of Object.entries(b.yearCols)) (votes[col] ??= {})[y] = (votes[col][y] ?? 0) + 1;
  const majority: Record<string, number> = {};
  for (const [col, v] of Object.entries(votes)) majority[col] = Number(Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]);

  for (const b of blocks) {
    const headerIssues: RowIssue[] = [];
    const seenYears = new Map<number, string>();
    for (const [col, y] of Object.entries(b.yearCols)) {
      if (seenYears.has(y)) {
        const fixCol = majority[col] !== y ? col : seenYears.get(y)!;
        headerIssues.push({ severity: "WARNING", code: "AMBIGUOUS_YEAR_HEADER", message: `Columns ${seenYears.get(y)} and ${col} are both labelled ${y}; column ${fixCol} is treated as ${majority[fixCol]} (as in the other MDA blocks)` });
        b.yearCols[fixCol] = majority[fixCol];
      }
      seenYears.set(y, col);
    }
    const differs = Object.entries(b.yearCols).filter(([col, y]) => majority[col] !== undefined && majority[col] !== y);
    if (differs.length) {
      headerIssues.push({ severity: "WARNING", code: "INCONSISTENT_YEAR_HEADER", message: `Year headers differ from the other MDA blocks (${differs.map(([c, y]) => `${c}=${y}`).join(", ")}); this block's own headers are used` });
    }
    const headerRow: ParsedRow = { sheetName: sheet.name, rowNumber: b.header.number, raw: rawOf(b.header), data: { role: "header", mdaCode: b.mdaCode, mdaName: b.mdaName, years: b.yearCols }, issues: headerIssues, status: "SKIPPED" };
    headerRow.status = deriveStatus(headerRow);
    out.push(headerRow);

    const coded = b.rows
      .map((row) => ({ row, code: codeText(row.cells.A), rawCode: cellText(row.cells.A) }))
      .filter((r) => r.rawCode !== "");
    const codes = coded.filter((c) => /^\d{2,}$/.test(c.code)).map((c) => c.code);
    const seen = new Map<string, { row: number; hasAmounts: boolean }>();
    for (const r of coded) {
      const issues: RowIssue[] = [];
      const isTotal = /^m\.?\s*xige$/i.test(r.rawCode);
      if (!isTotal && !/^\d{2,}$/.test(r.code)) {
        out.push({ sheetName: sheet.name, rowNumber: r.row.number, raw: rawOf(r.row), data: { role: "info", description: cellText(r.row.cells.B) }, issues: [{ severity: "INFO", code: "NOT_A_CODE", message: `"${r.rawCode}" is not a classification code — row ignored` }], status: "SKIPPED" });
        continue;
      }
      if (r.rawCode !== r.code && !isTotal) issues.push({ severity: "WARNING", code: "CODE_CLEANED", message: `Code "${r.rawCode}" contained stray characters; read as ${r.code}` });
      const amounts: Record<number, number | null> = {};
      const hiddenSubtotal = !isTotal && !isParent(r.code, codes) ? Object.keys(b.yearCols).filter((col) => isAggregateFormula(r.row.cells[col]?.formula)) : [];
      if (hiddenSubtotal.length) {
        issues.push({ severity: "WARNING", code: "HIDDEN_SUBTOTAL", message: `Treated as a subtotal and not imported: ${hiddenSubtotal.map((c) => `${c}${r.row.number} =${r.row.cells[c]!.formula}`).join("; ")}` });
      }
      const parent = isTotal || isParent(r.code, codes) || hiddenSubtotal.length > 0;
      for (const [col, y] of Object.entries(b.yearCols)) amounts[y] = readAmount(r.row.cells[col], String(y), issues, { derived: parent });
      const parsed: ParsedRow = {
        sheetName: sheet.name,
        rowNumber: r.row.number,
        raw: rawOf(r.row),
        data: { role: parent ? "aggregate" : "line", code: isTotal ? "TOTAL" : r.code, description: cellText(r.row.cells.B), mdaCode: b.mdaCode, mdaName: b.mdaName, amounts: Object.fromEntries(Object.entries(amounts)) },
        issues,
        status: "VALID",
      };
      if (parent) {
        parsed.issues = parsed.issues.filter((i) => i.code !== "FORMULA_VALUE");
        const leafRows = coded.filter((c) => /^\d{2,}$/.test(c.code) && !isParent(c.code, codes) && (isTotal || (c.code.startsWith(r.code) && c.code !== r.code)));
        for (const [col, y] of Object.entries(b.yearCols)) {
          const value = amounts[y];
          const leafSum = sum(leafRows.map((c) => readAmount(c.row.cells[col], String(y), [], {}) ?? 0));
          if (r.row.cells[col]?.error) {
            parsed.issues = parsed.issues.filter((i) => i.code !== "SOURCE_ERROR");
            parsed.issues.push({ severity: "WARNING", code: "SOURCE_TOTAL_ERROR", message: `${y}: the source total formula returns ${r.row.cells[col]?.error}; the total is recomputed from the detail lines (${leafSum.toLocaleString("en-US")})` });
          } else if (value !== null && Math.abs(value - leafSum) >= 1) {
            parsed.issues.push({ severity: "WARNING", code: "PARENT_TOTAL_MISMATCH", message: `${y}: total ${value.toLocaleString("en-US")} differs from the sum of its detail lines ${leafSum.toLocaleString("en-US")}` });
          }
        }
      } else {
        const rowHasAmounts = Object.values(amounts).some((v) => v);
        if (seen.has(r.code)) {
          const previous = seen.get(r.code)!;
          if (rowHasAmounts && previous.hasAmounts) {
            parsed.issues.push({ severity: "ERROR", code: "DUPLICATE_CODE", message: `Code ${r.code} already appears in this MDA block on row ${previous.row} with amounts — resolve before importing` });
          } else {
            parsed.issues.push({ severity: "INFO", code: "DUPLICATE_EMPTY", message: `Code ${r.code} repeats row ${previous.row}${rowHasAmounts ? "" : " without amounts"}` });
          }
        }
        if (!seen.has(r.code) || rowHasAmounts) seen.set(r.code, { row: r.row.number, hasAmounts: rowHasAmounts || (seen.get(r.code)?.hasAmounts ?? false) });
        const entries: BudgetEntry[] = [];
        for (const [y, v] of Object.entries(amounts)) {
          const year = Number(y);
          if (v === null || v === 0 || !targetYears.has(year)) continue;
          entries.push({ year, kind: r.code.startsWith("1") ? "REVENUE" : "EXPENDITURE", mdaCode: b.mdaCode, sourceCode: r.code, amount: v, description: cellText(r.row.cells.B), sourceRef: `${sheet.name}!R${r.row.number}` });
        }
        parsed.data.entries = entries;
        if (!Object.values(amounts).some((v) => v)) parsed.issues.push({ severity: "INFO", code: "NO_AMOUNTS", message: "No amounts on this row" });
      }
      parsed.status = deriveStatus(parsed);
      out.push(parsed);
    }
  }
  notes.push(`${blocks.length} MDA blocks; year columns by majority: ${Object.entries(majority).map(([c, y]) => `${c}=${y}`).join(", ")}`);
}

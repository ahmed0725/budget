/**
 * Report renderers: PDF (pdfmake), Excel (ExcelJS) and CSV. Amounts stay numeric in
 * Excel (with the currency number format) so totals can be re-checked in the workbook.
 */
import "server-only";
import ExcelJS from "exceljs";
import type { Content } from "pdfmake/interfaces";
import { toCsv } from "@/lib/exports/csv";
import { documentFrame, money, pct, renderPdf, sectionTitle, table } from "@/lib/exports/pdf";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import type { AppSettings } from "@/lib/services/settings";
import type { ColumnType, ReportResult } from "./types";

function text(value: unknown, type: ColumnType, settings: AppSettings, blankEmpty = false): string {
  if (value === null || value === undefined || value === "") return !blankEmpty && (type === "money" || type === "percent" || type === "number") ? "–" : "";
  switch (type) {
    case "money":
      return money(Number(value), settings.currency.symbol);
    case "percent":
      return pct(Number(value));
    case "number":
      return Number(value).toLocaleString("en-US");
    case "date":
      return formatCalendarDate(value as Date | string);
    case "datetime":
      return formatDateTime(value as Date | string, { timezone: settings.timezone });
    case "status":
      return String(value).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    default:
      return String(value);
  }
}

const numeric = (t: ColumnType) => t === "money" || t === "percent" || t === "number";

/** The built-in PDF fonts use WinAnsi encoding: replace characters it cannot show. */
const pdfSafe = (s: string) => s.replace(/−/g, "-").replace(/[→←]/g, "->");

export async function reportPdf(input: ReportResult, settings: AppSettings, generatedBy: string): Promise<Buffer> {
  const report: ReportResult = {
    ...input,
    title: pdfSafe(input.title),
    subtitle: pdfSafe(input.subtitle),
    filters: input.filters.map(pdfSafe),
    notes: input.notes?.map(pdfSafe),
    summary: input.summary?.map((s) => ({ ...s, label: pdfSafe(s.label), value: typeof s.value === "string" ? pdfSafe(s.value) : s.value })),
    sections: input.sections.map((s) => ({
      ...s,
      title: s.title ? pdfSafe(s.title) : s.title,
      note: s.note ? pdfSafe(s.note) : s.note,
      columns: s.columns.map((c) => ({ ...c, label: pdfSafe(c.label) })),
      rows: s.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? pdfSafe(v) : v]))),
      totals: s.totals ? Object.fromEntries(Object.entries(s.totals).map(([k, v]) => [k, typeof v === "string" ? pdfSafe(v) : v])) : undefined,
    })),
  };
  const content: Content[] = [];
  if (report.filters.length) content.push({ text: report.filters.join("   ·   "), style: "muted", margin: [0, 0, 0, 6] });
  if (report.summary?.length) {
    content.push(
      table(
        report.summary.map((s) => ({ header: s.label, align: numeric(s.type) ? "right" : "left" })),
        [report.summary.map((s) => text(s.value, s.type, settings))],
        { fontSize: 8 },
      ),
    );
  }
  for (const s of report.sections) {
    if (s.title) content.push(sectionTitle(s.title));
    if (s.note) content.push({ text: s.note, style: "muted", margin: [0, 0, 0, 4] });
    const fontSize = s.columns.length > 12 ? 6 : s.columns.length > 8 ? 7 : 8;
    content.push(
      table(
        s.columns.map((c) => ({ header: c.label, align: numeric(c.type) ? "right" : "left", width: c.type === "text" && s.columns.length < 10 ? "*" : "auto" })),
        s.rows.map((r) => s.columns.map((c) => text(r[c.key], c.type, settings))),
        { totalRow: s.totals ? s.columns.map((c) => text(s.totals![c.key], c.type, settings, true)) : undefined, fontSize },
      ),
    );
  }
  for (const n of report.notes ?? []) content.push({ text: n, style: "muted", margin: [0, 2, 0, 0] });
  const wide = report.landscape ?? report.sections.some((s) => s.columns.length > 7);
  return renderPdf(documentFrame(settings, { title: report.title, subtitle: report.subtitle, generatedBy, generatedAt: new Date(), landscape: wide, content }));
}

export async function reportXlsx(report: ReportResult, settings: AppSettings, generatedBy: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Government Budget Management System";
  wb.created = new Date();
  const moneyFmt = `"${settings.currency.symbol}"#,##0.${"0".repeat(settings.currency.decimals)};("${settings.currency.symbol}"#,##0.${"0".repeat(settings.currency.decimals)})`;
  const used = new Set<string>();
  const sheetName = (name: string) => {
    const base = name.replace(/[\\/*?:[\]]/g, " ").slice(0, 28).trim() || "Report";
    let n = base;
    let i = 2;
    while (used.has(n.toLowerCase())) n = `${base.slice(0, 25)} ${i++}`;
    used.add(n.toLowerCase());
    return n;
  };
  const sections = report.sections.length ? report.sections : [{ title: report.title, columns: [], rows: [] }];
  sections.forEach((s, idx) => {
    const ws = wb.addWorksheet(sheetName(s.title ?? (idx === 0 ? report.title : `Section ${idx + 1}`)));
    ws.addRow([settings.organization.governmentName]).font = { bold: true, color: { argb: "FF1F3864" } };
    ws.addRow([report.title]).font = { bold: true, size: 14, color: { argb: "FF1F3864" } };
    ws.addRow([report.subtitle]);
    if (report.filters.length) ws.addRow([report.filters.join(" · ")]).font = { italic: true, color: { argb: "FF5B6472" } };
    ws.addRow([`Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(new Date())} by ${generatedBy}`]).font = { size: 8, color: { argb: "FF5B6472" } };
    if (idx === 0 && report.summary?.length) {
      ws.addRow([]);
      for (const item of report.summary) {
        const r = ws.addRow([item.label, typeof item.value === "number" ? item.value : String(item.value ?? "")]);
        r.getCell(1).font = { bold: true };
        if (item.type === "money") r.getCell(2).numFmt = moneyFmt;
        if (item.type === "percent") r.getCell(2).numFmt = '0.0"%"';
      }
    }
    ws.addRow([]);
    if (s.title && sections.length > 1) ws.addRow([s.title]).font = { bold: true, size: 12, color: { argb: "FF2F5597" } };
    if (s.note) ws.addRow([s.note]).font = { italic: true, size: 9 };
    const header = ws.addRow(s.columns.map((c) => c.label));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF1F3864" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E0F0" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    const firstData = ws.rowCount + 1;
    const add = (r: Record<string, unknown>, bold = false) => {
      const row = ws.addRow(
        s.columns.map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined || v === "") return null;
          if (numeric(c.type)) return Number(v);
          if (c.type === "date" || c.type === "datetime") return v instanceof Date ? v : new Date(String(v));
          return String(v);
        }),
      );
      s.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.type === "money") cell.numFmt = moneyFmt;
        if (c.type === "percent") cell.numFmt = '0.0"%"';
        if (c.type === "number") cell.numFmt = "#,##0";
        if (c.type === "date") cell.numFmt = "dd mmm yyyy";
        if (c.type === "datetime") cell.numFmt = "dd mmm yyyy hh:mm";
        if (bold) {
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
        }
      });
    };
    s.rows.forEach((r) => add(r));
    if (s.totals) add(s.totals, true);
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      const longest = Math.max(c.label.length, ...s.rows.slice(0, 200).map((r) => String(r[c.key] ?? "").length));
      col.width = numeric(c.type) ? 18 : Math.min(60, Math.max(10, longest + 2));
    });
    ws.views = [{ state: "frozen", ySplit: firstData - 1 }];
    if (s.rows.length) ws.autoFilter = { from: { row: firstData - 1, column: 1 }, to: { row: firstData - 1, column: s.columns.length } };
  });
  const first = wb.worksheets[0];
  if (first) for (const n of report.notes ?? []) first.addRow([n]).getCell(1).font = { italic: true, size: 9 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV of all sections (a section title line separates sections when there are several). */
export function reportCsv(report: ReportResult): string {
  const bom = String.fromCharCode(0xfeff);
  const parts = report.sections.map((s, i) => {
    const rows = s.rows.map((r) => s.columns.map((c) => (r[c.key] instanceof Date ? (r[c.key] as Date).toISOString() : (r[c.key] as unknown))));
    if (s.totals) rows.push(s.columns.map((c) => s.totals![c.key] as unknown));
    const csv = toCsv(s.columns.map((c) => c.label), rows).replace(bom, "");
    const heading = report.sections.length > 1 ? `${s.title ?? `Section ${i + 1}`}\r\n` : "";
    return heading + csv;
  });
  return bom + parts.join("\r\n");
}

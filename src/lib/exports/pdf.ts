/**
 * PDF generation (pdfmake, server-side). Uses the built-in Helvetica font so no font
 * files are needed, and blocks all URL and local-file access by the renderer.
 */
import "server-only";
import type { Content, ContentTable, TDocumentDefinitions } from "pdfmake/interfaces";
import type { AppSettings } from "@/lib/services/settings";

// pdfmake's server build is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require("pdfmake") as {
  setFonts(fonts: object): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};

const STANDARD_FONTS = new Set(["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"]);

/** Applied before every render: the pdfmake instance is a process-wide singleton. */
function configure() {
  pdfmake.setFonts({ Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" } });
  pdfmake.setUrlAccessPolicy(() => false);
  // Only the built-in standard font identifiers may be resolved; no files on disk.
  pdfmake.setLocalAccessPolicy((p) => STANDARD_FONTS.has(p));
}

export const PDF_COLORS = { navy: "#1F3864", blue: "#2F5597", header: "#D6E0F0", total: "#FFF2CC", muted: "#5b6472", border: "#BFBFBF", green: "#007700", red: "#C00000" };

export async function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  configure();
  return Buffer.from(await pdfmake.createPdf(doc).getBuffer());
}

export function money(value: number | null | undefined, symbol = "$"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${symbol}${abs})` : `${symbol}${abs}`;
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${value.toFixed(1)}%`;
}

export interface PdfColumn {
  header: string;
  width?: string | number;
  align?: "left" | "right" | "center";
}

/** A styled data table (header row, zebra-free hairlines, optional bold total row). */
export function table(columns: PdfColumn[], rows: (string | number | null)[][], opts: { totalRow?: (string | number | null)[]; fontSize?: number } = {}): ContentTable {
  const fs = opts.fontSize ?? 8;
  const cell = (v: string | number | null, i: number, bold = false, fill?: string) => ({
    text: v === null || v === undefined ? "" : String(v),
    alignment: columns[i]?.align ?? "left",
    bold,
    fontSize: fs,
    fillColor: fill,
  });
  const body = [
    columns.map((c, i) => ({ text: c.header, bold: true, fontSize: fs, color: PDF_COLORS.navy, fillColor: PDF_COLORS.header, alignment: columns[i].align ?? "left" })),
    ...rows.map((r) => r.map((v, i) => cell(v, i))),
    ...(opts.totalRow ? [opts.totalRow.map((v, i) => cell(v, i, true, PDF_COLORS.total))] : []),
  ];
  return {
    table: { headerRows: 1, widths: columns.map((c) => c.width ?? "*"), body, dontBreakRows: true },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => PDF_COLORS.border,
      vLineColor: () => PDF_COLORS.border,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 2, 0, 8],
  };
}

export function sectionTitle(text: string): Content {
  return { text, style: "section", margin: [0, 10, 0, 4] };
}

/** Standard document frame: letterhead, title, footer with page numbers. */
export function documentFrame(settings: AppSettings, opts: { title: string; subtitle?: string; generatedBy: string; generatedAt: Date; landscape?: boolean; content: Content[] }): TDocumentDefinitions {
  const org = settings.organization;
  const stamp = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(opts.generatedAt);
  return {
    pageSize: "A4",
    pageOrientation: opts.landscape ? "landscape" : "portrait",
    pageMargins: [36, 70, 36, 44],
    info: { title: opts.title, author: org.ministryNameEn, creator: "Government Budget Management System" },
    defaultStyle: { font: "Helvetica", fontSize: 9, color: "#111111" },
    styles: {
      section: { fontSize: 11, bold: true, color: PDF_COLORS.blue },
      title: { fontSize: 16, bold: true, color: PDF_COLORS.navy },
      muted: { color: PDF_COLORS.muted, fontSize: 8 },
    },
    header: () => ({
      margin: [36, 20, 36, 0],
      columns: [
        { stack: [{ text: `${org.governmentName}`, bold: true, fontSize: 9, color: PDF_COLORS.navy }, { text: `${org.ministryName} — ${org.departmentName}`, fontSize: 8, color: PDF_COLORS.muted }] },
        { text: org.governmentNameEn, alignment: "right", fontSize: 8, color: PDF_COLORS.muted },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      margin: [36, 10, 36, 0],
      columns: [
        { text: `${opts.title} · Generated ${stamp} by ${opts.generatedBy}`, fontSize: 7, color: PDF_COLORS.muted },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", fontSize: 7, color: PDF_COLORS.muted },
      ],
    }),
    content: [
      { text: opts.title, style: "title" },
      ...(opts.subtitle ? [{ text: opts.subtitle, color: PDF_COLORS.muted, margin: [0, 2, 0, 10] as [number, number, number, number] }] : [{ text: "", margin: [0, 0, 0, 8] as [number, number, number, number] }]),
      ...opts.content,
    ],
  };
}

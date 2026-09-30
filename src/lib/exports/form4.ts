/**
 * Official budget preparation forms ("Foomamka Heerka Diyaarinta Miisaaniyadda",
 * Foom 4) generated from database data.
 *
 * The main sheet reproduces the layout, styling and formulas of the official
 * template (sections A–H, the automatic consistency checks and the certification
 * block). Rows grow with the data. Formulas are written with cached results so the
 * workbook shows correct values immediately; Excel recalculates on open. Detail
 * sheets list the classification-level lines behind the category totals.
 */
import ExcelJS from "exceljs";
import type { SubmissionBundle } from "@/lib/services/submission-data";
import type { AppSettings } from "@/lib/services/settings";

const C = {
  navy: "FF1F3864",
  gold: "FFBF9000",
  blue: "FF2F5597",
  header: "FFD6E0F0",
  input: "FFFFFBEA",
  calc: "FFF2F2F2",
  total: "FFFFF2CC",
  white: "FFFFFFFF",
  green: "FF007700",
  inputFont: "FF0000FF",
};
const MONEY = '$#,##0;"($"#,##0);–';
const MONEY_DETAIL = '$#,##0.00;"($"#,##0.00);–';
const PCT = "0.0%;(0.0%);–";
const INT = "#,##0;(#,##0);–";
const FONT = "Arial";

type Fill = keyof typeof C;
const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function style(cell: ExcelJS.Cell, opts: { fill?: Fill; bold?: boolean; size?: number; color?: string; italic?: boolean; numFmt?: string; align?: "left" | "center" | "right"; wrap?: boolean; indent?: number; noBorder?: boolean }) {
  cell.font = { name: FONT, size: opts.size ?? 10, bold: opts.bold, italic: opts.italic, color: { argb: opts.color ?? "FF000000" } };
  if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C[opts.fill] } };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  cell.alignment = { horizontal: opts.align ?? "left", vertical: "middle", wrapText: opts.wrap, indent: opts.indent ?? (opts.align === "center" ? 0 : 1) };
  if (!opts.noBorder) cell.border = border;
}

export interface Form4Extras {
  generatedBy: string;
  generatedAt: Date;
  versionLabel: string | null;
  mdaNameEn: string | null;
}

export async function buildForm4Workbook(bundle: SubmissionBundle, settings: AppSettings, extras: Form4Extras): Promise<Buffer> {
  const s = bundle.submission;
  const year = s.budgetYear.year;
  const baseYear = s.type === "REVISION" ? year : year - 1;
  const sum = bundle.summary;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Government Budget Management System";
  wb.created = extras.generatedAt;
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet(`Foomka Miisaaniyadda ${year}`, {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 90 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${s.mda.code} — ${s.mda.name}&CFoom ${year}&RBogga &P / &N` },
  });
  ws.columns = [{ width: 2.2 }, { width: 44 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 2.2 }];

  let r = 2;
  const merge = (row: number, from = "B", to = "G") => ws.mergeCells(`${from}${row}:${to}${row}`);

  // ── Title and instructions ───────────────────────────────────────────────
  merge(r);
  ws.getCell(`B${r}`).value = `LIFAAQA III — FOOMAMKA HEERKA AH EE DIYAARINTA MIISAANIYADDA ${year}`;
  style(ws.getCell(`B${r}`), { fill: "navy", bold: true, size: 15, color: C.white, align: "center", noBorder: true });
  ws.getRow(r).height = 34;
  r++;
  merge(r);
  ws.getCell(`B${r}`).value = `Hay'adaha Miisaaniyaddu waa inay adeegsadaan foomamkan marka ay diyaarinayaan oo gudbinayaan qiyaasaha miisaaniyadda ${year}.  •  Dhammaan tirooyinka waa ${settings.currency.name}.`;
  style(ws.getCell(`B${r}`), { fill: "gold", size: 9, color: C.white, align: "center", wrap: true, noBorder: true });
  ws.getRow(r).height = 26;
  r += 2;

  const section = (title: string) => {
    merge(r);
    ws.getCell(`B${r}`).value = title;
    style(ws.getCell(`B${r}`), { fill: "blue", bold: true, size: 11, color: C.white });
    ws.getRow(r).height = 21;
    r++;
  };
  const headers = (labels: string[], mergeLast?: [string, string]) => {
    const cols = ["B", "C", "D", "E", "F", "G"];
    labels.forEach((l, i) => {
      const cell = ws.getCell(`${cols[i]}${r}`);
      cell.value = l;
      style(cell, { fill: "header", bold: true, size: 9, color: C.navy, align: "center", wrap: true });
    });
    if (mergeLast) {
      ws.mergeCells(`${mergeLast[0]}${r}:${mergeLast[1]}${r}`);
    }
    ws.getRow(r).height = 30;
    r++;
  };
  const label = (row: number, text: string, bold = false) => {
    ws.getCell(`B${row}`).value = text;
    style(ws.getCell(`B${row}`), { bold, size: 10 });
  };
  const num = (ref: string, value: number | string | null | { formula: string; result: number | string }, fill: Fill = "calc", fmt = MONEY, bold = false) => {
    const cell = ws.getCell(ref);
    cell.value = value as ExcelJS.CellValue;
    style(cell, { fill, numFmt: fmt, align: "right", bold, color: fill === "input" ? C.inputFont : undefined });
  };
  const text = (ref: string, value: string | null, fill: Fill | undefined = "input") => {
    const cell = ws.getCell(ref);
    cell.value = value ?? "";
    style(cell, { fill, wrap: true, color: fill === "input" ? C.inputFont : undefined });
  };
  const change = (row: number, a: string, b: string, approved: number, proposed: number) => {
    num(`E${row}`, { formula: `${b}${row}-${a}${row}`, result: proposed - approved });
    num(`F${row}`, { formula: `IF(N(${a}${row})=0,"",(${b}${row}-${a}${row})/${a}${row})`, result: approved ? (proposed - approved) / approved : "" }, "calc", PCT);
  };

  // ── Form A ───────────────────────────────────────────────────────────────
  section("FOOM A — SOO-KOOBIDDA HAY'ADDA");
  ws.getCell(`B${r}`).value = "Qodob";
  style(ws.getCell(`B${r}`), { fill: "header", bold: true, size: 9, color: C.navy, align: "center" });
  ws.mergeCells(`C${r}:G${r}`);
  ws.getCell(`C${r}`).value = "Faahfaahin";
  style(ws.getCell(`C${r}`), { fill: "header", bold: true, size: 9, color: C.navy, align: "center" });
  r++;
  const agencyRow = r;
  const formA: [string, string | null][] = [
    ["Hay'adda", `${s.mda.code} — ${s.mda.name}`],
    ["Lambarka Qoondaynta", s.allocationNumber],
    ["Qaybta", s.agencyCategory],
    ["Mas'uulka Xisaab-celinta", s.accountingOfficer],
    ["Qofka Xidhiidhka", s.contactPerson],
    ["Telefoon", s.telephone],
    ["Iimayl", s.email],
  ];
  for (const [l, v] of formA) {
    label(r, l, true);
    ws.mergeCells(`C${r}:G${r}`);
    text(`C${r}`, v);
    r++;
  }
  r++;

  // Row positions of Form D and F totals are needed by Form B formulas, so compute layout first.
  const dRows = sum.formD.rows;
  const formBStart = r + 2; // after section + header
  const formBEnd = formBStart + 4;
  const formCHeaderRow = formBEnd + 2;
  const revenueRows = sum.formC.rows;
  const formCFirst = formCHeaderRow + 2;
  const formCTotal = formCFirst + revenueRows.length;
  const formDFirst = formCTotal + 4;
  const formDTotal = formDFirst + dRows.length;
  const dRowOf = (key: string) => formDFirst + dRows.findIndex((x) => x.key === key);
  const personnel = bundle.personnel;
  const eRowsCount = Math.max(12, personnel.length);
  const formEFirst = formDTotal + 4;
  const formETotal = formEFirst + eRowsCount;
  const capital = bundle.capital;
  const fRowsCount = Math.max(8, capital.length);
  const formFFirst = formETotal + 5; // HR certification row + blank + section + header
  const formFTotal = formFFirst + fRowsCount;

  // ── Form B ───────────────────────────────────────────────────────────────
  section("FOOM B — SOO-KOOBIDDA MIISAANIYADDA HAY'ADDA");
  headers(["Qaybta Miisaaniyadda", `${baseYear} La Ansixiyey (US$)`, `Soo-jeedinta ${year} (US$)`, "Isbeddel (US$)", "Isbeddel (%)", "Faallo"]);
  const bRows = sum.formB.rows;
  const persRow = dRows.findIndex((x) => x.summaryGroup === "PERSONNEL");
  const gsRow = dRows.findIndex((x) => x.summaryGroup === "GOODS_SERVICES");
  const otherRows = dRows.map((x, i) => ({ x, i })).filter(({ x }) => x.summaryGroup !== "PERSONNEL" && x.summaryGroup !== "GOODS_SERVICES");
  const otherRef = (col: string) => (otherRows.length ? otherRows.map(({ i }) => `${col}${formDFirst + i}`).join("+") : "0");
  const bSources: Record<string, { c: string; d: string }> = {
    PERSONNEL: { c: `C${formDFirst + persRow}`, d: `D${formDFirst + persRow}` },
    GOODS_SERVICES: { c: `C${formDFirst + gsRow}`, d: `D${formDFirst + gsRow}` },
    CAPITAL: { c: "", d: `E${formFTotal}` },
    OTHER: { c: otherRef("C"), d: otherRef("D") },
  };
  const bNames: Record<string, string> = { PERSONNEL: "Shaqaalaha", GOODS_SERVICES: "Agabyada iyo adeegyada", CAPITAL: "Kharashaadka raasamaalka", OTHER: "Kharashaad kale" };
  for (const row of bRows) {
    label(r, bNames[row.key] ?? row.labelSo);
    const src = bSources[row.key];
    num(`C${r}`, src.c ? { formula: src.c, result: row.approved } : row.approved, "calc");
    ws.getCell(`C${r}`).font = { name: FONT, size: 10, color: { argb: C.green } };
    num(`D${r}`, { formula: src.d, result: row.proposed });
    ws.getCell(`D${r}`).font = { name: FONT, size: 10, color: { argb: C.green } };
    change(r, "C", "D", row.approved, row.proposed);
    text(`G${r}`, bundle.notes[`B:${row.key}`] ?? null);
    r++;
  }
  label(r, "WADARTA MIISAANIYADDA", true);
  const bt = sum.formB.total;
  for (const [col, v] of [["C", bt.approved], ["D", bt.proposed], ["E", bt.change]] as const) num(`${col}${r}`, { formula: `SUM(${col}${formBStart}:${col}${formBEnd - 1})`, result: v }, "total", MONEY, true);
  num(`F${r}`, { formula: `IF(N(C${r})=0,"",(D${r}-C${r})/C${r})`, result: bt.approved ? bt.change / bt.approved : "" }, "total", PCT, true);
  text(`G${r}`, bundle.notes["B:TOTAL"] ?? null, "total");
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  const formBTotalRow = r;
  r += 2;

  // ── Form C ───────────────────────────────────────────────────────────────
  section("FOOM C — QIYAASAHA DAKHLIGA");
  headers(["Isha Dakhliga", `Dhabta ${baseYear - 1}`, `${baseYear} La Ansixiyey`, `Waxqabadka ${baseYear}`, `Qiyaasta ${year}`, "Faallo"]);
  const revNames: Record<string, string> = { TAXES: "Cashuuraha", FEES: "Ajuurooyinka iyo khidmadaha", LICENSES: "Rukhsadaha", FINES: "Ganaaxyada", OTHER_REVENUE: "Dakhli kale" };
  const catCode = new Map(bundle.categories.map((c) => [c.id, c.code]));
  for (const row of revenueRows) {
    label(r, revNames[catCode.get(row.categoryId) ?? ""] ?? row.labelSo);
    num(`C${r}`, row.priorYearActual, "input");
    num(`D${r}`, row.currentApproved, "input");
    num(`E${r}`, row.currentPerformance, "input");
    num(`F${r}`, row.estimate, "input");
    text(`G${r}`, bundle.notes[`C:${row.categoryId}`] ?? null);
    r++;
  }
  label(r, "WADARTA DAKHLIGA", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  const ct = sum.formC.total;
  for (const [col, v] of [["C", ct.priorYearActual], ["D", ct.currentApproved], ["E", ct.currentPerformance], ["F", ct.estimate]] as const) num(`${col}${r}`, { formula: `SUM(${col}${formCFirst}:${col}${formCTotal - 1})`, result: v }, "total", MONEY, true);
  style(ws.getCell(`G${r}`), { fill: "total" });
  const formCTotalRow = r;
  r += 2;

  // ── Form D ───────────────────────────────────────────────────────────────
  section("FOOM D — MIISAANIYADDA KHARASHAADKA JOOGTADA AH");
  headers(["Qaybta Kharashaadka", `${baseYear} La Ansixiyey`, `Soo-jeedinta ${year}`, "Isbeddel (%)", "Sababaynta", ""], ["F", "G"]);
  for (const row of dRows) {
    label(r, row.labelSo);
    num(`C${r}`, row.approved, "input");
    num(`D${r}`, row.proposed, "input");
    num(`E${r}`, { formula: `IF(N(C${r})=0,"",(D${r}-C${r})/C${r})`, result: row.approved ? (row.proposed - row.approved) / row.approved : "" }, "calc", PCT);
    ws.mergeCells(`F${r}:G${r}`);
    text(`F${r}`, bundle.notes[`D:${row.categoryId}`] ?? null);
    r++;
  }
  label(r, "WADARTA KHARASHAADKA JOOGTADA AH", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  const dt = sum.formD.total;
  num(`C${r}`, { formula: `SUM(C${formDFirst}:C${formDTotal - 1})`, result: dt.approved }, "total", MONEY, true);
  num(`D${r}`, { formula: `SUM(D${formDFirst}:D${formDTotal - 1})`, result: dt.proposed }, "total", MONEY, true);
  num(`E${r}`, { formula: `IF(N(C${r})=0,"",(D${r}-C${r})/C${r})`, result: dt.approved ? dt.change / dt.approved : "" }, "total", PCT, true);
  ws.mergeCells(`F${r}:G${r}`);
  style(ws.getCell(`F${r}`), { fill: "total" });
  const formDTotalRow = r;
  r += 2;

  // ── Form E ───────────────────────────────────────────────────────────────
  section("FOOM E — MIISAANIYADDA SHAQAALAHA");
  headers(["Magaca Jagada", "Qaab-dhismeedka La Ansixiyey", "Jagooyinka La Buuxiyey", "Kharashka Bishii (US$)", "Kharashka Sannadkii (US$)", "Faallo"]);
  for (let i = 0; i < eRowsCount; i++) {
    const p = personnel[i];
    ws.getCell(`B${r}`).value = p ? `${p.positionTitle}${p.grade ? ` (${p.grade})` : ""}` : "";
    style(ws.getCell(`B${r}`), { fill: "input", color: C.inputFont });
    num(`C${r}`, p ? p.approvedEstablishment : null, "input", INT);
    num(`D${r}`, p ? p.filledPositions : null, "input", INT);
    num(`E${r}`, p ? p.monthlyCost : null, "input");
    num(`F${r}`, { formula: `IF(N(D${r})*N(E${r})=0,"",D${r}*E${r}*12)`, result: p && p.filledPositions && p.monthlyCost ? p.filledPositions * p.monthlyCost * 12 : "" });
    text(`G${r}`, p?.remarks ?? null);
    r++;
  }
  label(r, "WADARTA KHARASHKA SHAQAALAHA", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  const et = sum.formE;
  for (const [col, v, fmt] of [["C", et.totalEstablishment, INT], ["D", et.totalFilled, INT], ["E", et.totalMonthly, MONEY], ["F", et.totalAnnual, MONEY]] as const) num(`${col}${r}`, { formula: `SUM(${col}${formEFirst}:${col}${formETotal - 1})`, result: v }, "total", fmt, true);
  style(ws.getCell(`G${r}`), { fill: "total" });
  const formETotalRow = r;
  r++;
  merge(r);
  const cert = s.certification;
  ws.getCell(`B${r}`).value = `Caddaynta Kheyraadka Aadanaha — Madaxa Kheyraadka Aadanaha: ${cert?.hrCertifiedByName ?? "______________________________"}    Taariikhda: ${cert?.hrCertifiedAt ? cert.hrCertifiedAt.toISOString().slice(0, 10) : "_____________________"}`;
  style(ws.getCell(`B${r}`), { italic: true, size: 9 });
  r += 2;

  // ── Form F ───────────────────────────────────────────────────────────────
  section("FOOM F — MASHAARIICDA RAASAMAALKA");
  headers(["Mashruuca", "Goobta", "Wadarta Kharashka (US$)", `Qoondaynta ${year} (US$)`, "Isha Maalgelinta", "Dhammaystirka La Filayo"]);
  for (let i = 0; i < fRowsCount; i++) {
    const p = capital[i];
    ws.getCell(`B${r}`).value = p?.name ?? "";
    style(ws.getCell(`B${r}`), { fill: "input", color: C.inputFont, wrap: true });
    text(`C${r}`, p?.location ?? null);
    num(`D${r}`, p ? p.totalCost : null, "input");
    num(`E${r}`, p ? p.allocation : null, "input");
    text(`F${r}`, p ? p.fundingSourceName ?? (p.fundingType === "DONOR" ? "Deeq-bixiye" : "Dowladda") : null);
    text(`G${r}`, p?.expectedCompletionDate ?? null);
    r++;
  }
  label(r, "WADARTA KHARASHKA RAASAMAALKA", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  style(ws.getCell(`C${r}`), { fill: "total" });
  num(`D${r}`, { formula: `SUM(D${formFFirst}:D${formFTotal - 1})`, result: sum.formF.totalProjectCost }, "total", MONEY, true);
  num(`E${r}`, { formula: `SUM(E${formFFirst}:E${formFTotal - 1})`, result: sum.formF.totalAllocation }, "total", MONEY, true);
  style(ws.getCell(`F${r}`), { fill: "total" });
  style(ws.getCell(`G${r}`), { fill: "total" });
  const formFTotalRow = r;
  r++;
  ws.mergeCells(`B${r}:G${r + 1}`);
  ws.getCell(`B${r}`).value = `Sababaynta Mashruuca: ${capital.filter((c) => c.justification).map((c) => `${c.name}: ${c.justification}`).join("  •  ")}`;
  style(ws.getCell(`B${r}`), { wrap: true, size: 9 });
  ws.getRow(r).height = 30;
  r += 3;

  // ── Form G ───────────────────────────────────────────────────────────────
  section("FOOM G — QORSHAHA IIBSIGA SANNADLAHA AH");
  headers(["Shayga Iibsiga", "Kharashka La Qiyaasay (US$)", "Habka", "Saddex-biloodka", "Waaxda Mas'uulka ah", "Faallo"]);
  const gRowsCount = Math.max(10, bundle.procurement.length);
  const formGFirst = r;
  for (let i = 0; i < gRowsCount; i++) {
    const p = bundle.procurement[i];
    ws.getCell(`B${r}`).value = p?.itemDescription ?? "";
    style(ws.getCell(`B${r}`), { fill: "input", color: C.inputFont, wrap: true });
    num(`C${r}`, p ? p.estimatedCost : null, "input");
    text(`D${r}`, p?.procurementMethodName ?? null);
    text(`E${r}`, p?.quarter ?? null);
    text(`F${r}`, p?.responsibleDepartment ?? null);
    text(`G${r}`, p?.remarks ?? null);
    r++;
  }
  label(r, "WADARTA QORSHAHA IIBSIGA", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  num(`C${r}`, { formula: `SUM(C${formGFirst}:C${r - 1})`, result: sum.formG.total }, "total", MONEY, true);
  for (const col of ["D", "E", "F", "G"]) style(ws.getCell(`${col}${r}`), { fill: "total" });
  const formGTotalRow = r;
  r += 2;

  // ── Form H ───────────────────────────────────────────────────────────────
  section("FOOM H — SAADAASHA QULQULKA LACAGTA EE SADDEX-BILOODLE");
  headers(["Saddex-biloodka", "Baahida Lacagta (US$)", "% Wadarta", "Faallo", "", ""], ["E", "G"]);
  const hNames = [`Saddex-biloodka 1aad (Janaayo – Maarso ${year})`, `Saddex-biloodka 2aad (Abriil – Juun ${year})`, `Saddex-biloodka 3aad (Luulyo – Sebteembar ${year})`, `Saddex-biloodka 4aad (Oktoobar – Diseembar ${year})`];
  const formHFirst = r;
  const formHTotal = r + 4;
  bundle.cashFlow.forEach((c, i) => {
    label(r, hNames[i]);
    num(`C${r}`, c.amount, "input");
    num(`D${r}`, { formula: `IF(N($C$${formHTotal})=0,"",C${r}/$C$${formHTotal})`, result: sum.formH.total ? c.amount / sum.formH.total : "" }, "calc", PCT);
    ws.mergeCells(`E${r}:G${r}`);
    text(`E${r}`, c.remarks);
    r++;
  });
  label(r, "WADARTA QULQULKA LACAGTA", true);
  ws.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
  num(`C${r}`, { formula: `SUM(C${formHFirst}:C${r - 1})`, result: sum.formH.total }, "total", MONEY, true);
  num(`D${r}`, { formula: `IF(N(C${r})=0,"",1)`, result: sum.formH.total ? 1 : "" }, "total", PCT, true);
  ws.mergeCells(`E${r}:G${r}`);
  style(ws.getCell(`E${r}`), { fill: "total" });
  r += 2;

  // ── Consistency checks ───────────────────────────────────────────────────
  section("HUBINTA TOOSAN — ISKU-WAAFAJINTA FOOMAMKA (si otomaatig ah ayey u shaqeysaa)");
  headers(["Hubinta Isku-waafajinta", "Qiimaha Xisaabsan", "Qiimaha La Barbardhigayo", "Faraqa", "Natiijada", ""], ["F", "G"]);
  const personnelRow = dRowOf("PERSONNEL");
  const eligible = dRows.map((x, i) => ({ x, i })).filter(({ x }) => bundle.categories.find((c) => c.id === x.categoryId)?.procurementEligible);
  const checks: [string, string, string, number, number, "eq" | "le"][] = [
    ["Kharashka shaqaalaha (Foom D) = Wadarta Foom E", `D${personnelRow}`, `F${formETotalRow}`, sum.formB.rows[0].proposed, sum.formE.totalAnnual, "eq"],
    ["Wadarta Foom B = Joogto (Foom D) + Raasamaal (Foom F)", `D${formBTotalRow}`, `D${formDTotalRow}+E${formFTotalRow}`, sum.formB.total.proposed, sum.formD.total.proposed + sum.formF.totalAllocation, "eq"],
    ["Qulqulka lacagta (Foom H) = Wadarta Miisaaniyadda (Foom B)", `C${formHTotal}`, `D${formBTotalRow}`, sum.formH.total, sum.formB.total.proposed, "eq"],
    ["Qorshaha iibsiga (Foom G) ≤ Agab+Adeeg+Raasamaal", `C${formGTotalRow}`, `${eligible.map(({ i }) => `D${formDFirst + i}`).join("+") || "0"}+E${formFTotalRow}`, sum.formG.total, sum.totals.procurementEligible, "le"],
    [`Dakhliga ${year} (Foom C) = Kharashka ${year} (Foom B)`, `F${formCTotalRow}`, `D${formBTotalRow}`, sum.totals.revenue, sum.totals.expenditure, "eq"],
  ];
  for (const [name, calc, cmp, cv, xv, kind] of checks) {
    ws.getCell(`B${r}`).value = name;
    style(ws.getCell(`B${r}`), { size: 9 });
    num(`C${r}`, { formula: calc, result: cv });
    num(`D${r}`, { formula: cmp, result: xv });
    num(`E${r}`, { formula: `C${r}-D${r}`, result: cv - xv });
    ws.mergeCells(`F${r}:G${r}`);
    const ok = kind === "eq" ? Math.abs(cv - xv) < 1 : cv <= xv;
    const cell = ws.getCell(`F${r}`);
    cell.value = { formula: kind === "eq" ? `IF(ABS(E${r})<1,"WAAFAQSAN","KALA DUWAN - dib u eeg")` : `IF(C${r}<=D${r},"WAAFAQSAN","KA BADAN XADKA - dib u eeg")`, result: ok ? "WAAFAQSAN" : kind === "eq" ? "KALA DUWAN - dib u eeg" : "KA BADAN XADKA - dib u eeg" };
    style(cell, { fill: "calc", bold: true, align: "center", color: ok ? C.green : "FFC00000" });
    r++;
  }
  merge(r);
  ws.getCell(`B${r}`).value = 'Fiiro gaar ah: haddii mid ka mid ah safafka kore uu muujiyo "KALA DUWAN", foomka ha la gudbin — marka hore saxi tirooyinka xidhiidhka leh.';
  style(ws.getCell(`B${r}`), { italic: true, size: 9, wrap: true });
  r += 2;

  // ── Certification ────────────────────────────────────────────────────────
  section("BAYAANKA XAQIIJINTA");
  merge(r);
  ws.getCell(`B${r}`).value = `Waxaan caddeynayaa in xogta ku jirta foomamkan miisaaniyaddu ay dhammaystiran tahay, sax tahay, laguna diyaariyey si waafaqsan Wareegtada Diyaarinta Miisaaniyadda ${year}.`;
  style(ws.getCell(`B${r}`), { italic: true, wrap: true });
  ws.getRow(r).height = 30;
  r++;
  const certRows: [string, string | null][] = [
    ["Hay'adda", { formula: `IF(C${agencyRow}="","",C${agencyRow})`, result: `${s.mda.code} — ${s.mda.name}` } as unknown as string],
    ["Diyaariyey (Sarkaalka Miisaaniyadda)", cert?.preparedByName ? `${cert.preparedByName}${cert.preparedByTitle ? `, ${cert.preparedByTitle}` : ""}` : null],
    ["Saxiixa / Taariikhda", cert?.preparedSignature ?? null],
    ["Dib u eegay (Agaasimaha Maaliyadda)", cert?.reviewedByName ? `${cert.reviewedByName}${cert.reviewedByTitle ? `, ${cert.reviewedByTitle}` : ""}` : null],
    ["Saxiixa / Taariikhda", cert?.reviewedSignature ?? null],
    ["Ansixiyey (Mas'uulka Xisaab-celinta)", cert?.approvedByName ? `${cert.approvedByName}${cert.approvedByTitle ? `, ${cert.approvedByTitle}` : ""}` : null],
    ["Saxiixa / Taariikhda", cert?.approvedSignature ?? null],
    ["Shaabadda Rasmiga ah", cert?.stampAttachmentId ? "Lifaaq (eeg lifaaqyada)" : null],
  ];
  for (const [l, v] of certRows) {
    label(r, l, true);
    ws.mergeCells(`C${r}:G${r}`);
    const cell = ws.getCell(`C${r}`);
    cell.value = (v as ExcelJS.CellValue) ?? "";
    style(cell, { fill: "calc", color: C.green, wrap: true, size: 9 });
    r++;
  }
  ws.pageSetup.printArea = `A1:H${r}`;
  ws.pageSetup.printTitlesRow = "2:3";

  // ── Detail sheets ────────────────────────────────────────────────────────
  const detail = (name: string, head: string[], rows: (string | number | null)[][], moneyCols: number[]) => {
    const sheet = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(head);
    sheet.getRow(1).eachCell((c) => style(c, { fill: "header", bold: true, size: 9, color: C.navy, align: "center", wrap: true }));
    sheet.getRow(1).height = 30;
    for (const row of rows) {
      const added = sheet.addRow(row);
      added.eachCell((c, col) => style(c, { numFmt: moneyCols.includes(col) ? MONEY_DETAIL : undefined, align: moneyCols.includes(col) ? "right" : "left", size: 9 }));
    }
    sheet.columns.forEach((col, i) => (col.width = i === 1 ? 44 : moneyCols.includes(i + 1) ? 18 : 16));
    sheet.autoFilter = { from: "A1", to: { row: 1, column: head.length } };
    return sheet;
  };
  const catName = new Map(bundle.categories.map((c) => [c.id, c.nameSo]));
  detail(
    "Faahfaahinta Kharashka",
    ["Koodh", "Faahfaahin", "Qaybta", `${baseYear} La Ansixiyey`, `Soo-jeedinta ${year}`, "Isbeddel", "Sababaynta"],
    bundle.expenditureLines.map((l) => [l.code, l.description || l.codeName, catName.get(l.categoryId ?? "") ?? "", bundle.baselineByCode[l.budgetCodeId] ?? null, l.amount, l.amount - (bundle.baselineByCode[l.budgetCodeId] ?? 0), l.justification]),
    [4, 5, 6],
  );
  detail(
    "Faahfaahinta Dakhliga",
    ["Koodh", "Faahfaahin", "Qaybta", `Dhabta ${baseYear - 1}`, `${baseYear} La Ansixiyey`, `Waxqabadka ${baseYear}`, `Qiyaasta ${year}`],
    bundle.revenueLines.map((l) => [l.code, l.description || l.codeName, catName.get(l.categoryId ?? "") ?? "", l.priorYearActual, bundle.baselineByCode[l.budgetCodeId] ?? null, l.currentYearEstimate, l.amount]),
    [4, 5, 6, 7],
  );
  detail(
    "Hubinta",
    ["Hubinta", "Natiijada", "Qiimaha Xisaabsan", "Qiimaha La Barbardhigayo", "Faraqa", "Faahfaahin"],
    bundle.checks.map((c) => [c.name, c.status, c.calculated, c.expected, c.difference, [c.message, ...c.details.slice(0, 5)].join("; ")]),
    [3, 4, 5],
  );
  const meta = wb.addWorksheet("Xogta Dukumentiga");
  const metaRows: [string, string][] = [
    ["Hay'adda / MDA", `${s.mda.code} — ${s.mda.name}${extras.mdaNameEn ? ` (${extras.mdaNameEn})` : ""}`],
    ["Sannadka / Budget year", String(year)],
    ["Xaaladda / Status", s.status],
    ["Nooca / Type", s.type === "REVISION" ? `Revision ${s.revisionNumber} (${s.revisionType})` : "Original"],
    ["Nooca kaydka / Version", extras.versionLabel ?? "Current working data"],
    ["La sameeyey / Generated", extras.generatedAt.toISOString()],
    ["Waxaa sameeyey / Generated by", extras.generatedBy],
    ["Lacagta / Currency", settings.currency.name],
    ["Nidaamka / System", "Government Budget Management System"],
  ];
  metaRows.forEach(([k, v]) => {
    const row = meta.addRow([k, v]);
    style(row.getCell(1), { bold: true, fill: "header", size: 9 });
    style(row.getCell(2), { size: 9 });
  });
  meta.getColumn(1).width = 32;
  meta.getColumn(2).width = 70;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

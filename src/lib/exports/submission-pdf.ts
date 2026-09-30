/** Budget submission package (Forms A–H, validation, certification, approval history) as PDF. */
import "server-only";
import type { Content } from "pdfmake/interfaces";
import type { SubmissionBundle } from "@/lib/services/submission-data";
import type { AppSettings } from "@/lib/services/settings";
import { documentFrame, money, pct, PDF_COLORS, renderPdf, sectionTitle, table } from "./pdf";

export async function buildSubmissionPdf(
  bundle: SubmissionBundle,
  settings: AppSettings,
  extras: { generatedBy: string; generatedAt: Date; steps: { action: string; toStatus: string; actorName: string | null; comment: string | null; createdAt: Date }[] },
): Promise<Buffer> {
  const s = bundle.submission;
  const year = s.budgetYear.year;
  const base = s.type === "REVISION" ? year : year - 1;
  const sum = bundle.summary;
  const sym = settings.currency.symbol;
  const m = (v: number | null | undefined) => money(v, sym);
  const cert = s.certification;
  const signed = [cert?.preparedAt, cert?.reviewedAt, cert?.approvedAt].filter(Boolean).length;

  const content: Content[] = [
    {
      table: {
        widths: [130, "*"],
        body: [
          ["Hay'adda / MDA", `${s.mda.code} — ${s.mda.name}${s.mda.nameEn ? ` (${s.mda.nameEn})` : ""}`],
          ["Xaaladda / Status", `${s.status}${s.isLocked ? " (locked)" : ""}`],
          ["Nooca / Type", s.type === "REVISION" ? `Revision ${s.revisionNumber} — ${s.revisionType}` : "Original budget"],
          ["Wadarta / Total budget", m(sum.totals.expenditure)],
          ["Dakhliga / Revenue", m(sum.totals.revenue)],
          ["Hubinta / Validation", `${bundle.tally.passed} passed · ${bundle.tally.warnings} warnings · ${bundle.tally.errors} errors`],
          ["Caddaynta / Certification", `${signed}/3 signed`],
        ].map(([k, v]) => [{ text: k, bold: true, fillColor: PDF_COLORS.header, fontSize: 8 }, { text: v, fontSize: 9 }]),
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 6],
    },

    sectionTitle("FOOM A — Soo-koobidda Hay'adda / Agency summary"),
    table(
      [{ header: "Qodob", width: 160 }, { header: "Faahfaahin" }],
      [
        ["Lambarka Qoondaynta", s.allocationNumber],
        ["Qaybta", s.agencyCategory],
        ["Mas'uulka Xisaab-celinta", s.accountingOfficer],
        ["Qofka Xidhiidhka", s.contactPerson],
        ["Telefoon", s.telephone],
        ["Iimayl", s.email],
      ],
    ),

    sectionTitle("FOOM B — Soo-koobidda Miisaaniyadda / Budget summary"),
    table(
      [{ header: "Qaybta" }, { header: `${base} La Ansixiyey`, align: "right", width: 80 }, { header: `Soo-jeedinta ${year}`, align: "right", width: 80 }, { header: "Isbeddel", align: "right", width: 70 }, { header: "%", align: "right", width: 40 }, { header: "Faallo", width: 110 }],
      sum.formB.rows.map((r) => [r.labelSo, m(r.approved), m(r.proposed), m(r.change), pct(r.changePercent), bundle.notes[`B:${r.key}`] ?? ""]),
      { totalRow: ["WADARTA MIISAANIYADDA", m(sum.formB.total.approved), m(sum.formB.total.proposed), m(sum.formB.total.change), pct(sum.formB.total.changePercent), ""] },
    ),

    sectionTitle("FOOM C — Qiyaasaha Dakhliga / Revenue estimates"),
    table(
      [{ header: "Isha Dakhliga" }, { header: `Dhabta ${base - 1}`, align: "right", width: 72 }, { header: `${base} La Ansixiyey`, align: "right", width: 72 }, { header: `Waxqabadka ${base}`, align: "right", width: 72 }, { header: `Qiyaasta ${year}`, align: "right", width: 72 }],
      sum.formC.rows.map((r) => [r.labelSo, m(r.priorYearActual), m(r.currentApproved), m(r.currentPerformance), m(r.estimate)]),
      { totalRow: ["WADARTA DAKHLIGA", m(sum.formC.total.priorYearActual), m(sum.formC.total.currentApproved), m(sum.formC.total.currentPerformance), m(sum.formC.total.estimate)] },
    ),

    sectionTitle("FOOM D — Kharashaadka Joogtada ah / Recurrent expenditure"),
    table(
      [{ header: "Qaybta" }, { header: `${base} La Ansixiyey`, align: "right", width: 85 }, { header: `Soo-jeedinta ${year}`, align: "right", width: 85 }, { header: "%", align: "right", width: 40 }, { header: "Sababaynta", width: 140 }],
      sum.formD.rows.map((r) => [r.labelSo, m(r.approved), m(r.proposed), pct(r.changePercent), bundle.notes[`D:${r.categoryId}`] ?? ""]),
      { totalRow: ["WADARTA JOOGTADA", m(sum.formD.total.approved), m(sum.formD.total.proposed), pct(sum.formD.total.changePercent), ""] },
    ),
    table(
      [{ header: "Koodh", width: 45 }, { header: "Faahfaahin" }, { header: `${base}`, align: "right", width: 75 }, { header: `${year}`, align: "right", width: 75 }],
      bundle.expenditureLines.map((l) => [l.code, l.description || l.codeName, bundle.baselineByCode[l.budgetCodeId] === undefined ? "–" : m(bundle.baselineByCode[l.budgetCodeId]), m(l.amount)]),
      { fontSize: 7 },
    ),

    sectionTitle("FOOM E — Miisaaniyadda Shaqaalaha / Personnel"),
    table(
      [{ header: "Magaca Jagada" }, { header: "Qaab-dhismeed", align: "right", width: 60 }, { header: "La buuxiyey", align: "right", width: 55 }, { header: "Bishii", align: "right", width: 70 }, { header: "Sannadkii", align: "right", width: 80 }],
      bundle.personnel.map((p) => [`${p.positionTitle}${p.grade ? ` (${p.grade})` : ""}`, p.approvedEstablishment, p.filledPositions, m(p.monthlyCost), m(p.annualCost)]),
      { totalRow: ["WADARTA", sum.formE.totalEstablishment, sum.formE.totalFilled, m(sum.formE.totalMonthly), m(sum.formE.totalAnnual)] },
    ),

    sectionTitle("FOOM F — Mashaariicda Raasamaalka / Capital projects"),
    table(
      [{ header: "Mashruuca" }, { header: "Goobta", width: 80 }, { header: "Wadarta", align: "right", width: 70 }, { header: `Qoondaynta ${year}`, align: "right", width: 70 }, { header: "Isha", width: 70 }, { header: "Dhammaystir", width: 55 }],
      bundle.capital.map((c) => [c.name, c.location ?? "", m(c.totalCost), m(c.allocation), c.fundingSourceName ?? c.fundingType, c.expectedCompletionDate ?? ""]),
      { totalRow: ["WADARTA RAASAMAALKA", "", m(sum.formF.totalProjectCost), m(sum.formF.totalAllocation), "", ""] },
    ),

    sectionTitle("FOOM G — Qorshaha Iibsiga / Procurement plan"),
    table(
      [{ header: "Shayga" }, { header: "Kharashka", align: "right", width: 75 }, { header: "Habka", width: 85 }, { header: "Q", width: 22 }, { header: "Waaxda", width: 90 }],
      bundle.procurement.map((p) => [p.itemDescription, m(p.estimatedCost), p.procurementMethodName ?? "", p.quarter, p.responsibleDepartment ?? ""]),
      { totalRow: ["WADARTA IIBSIGA", m(sum.formG.total), "", "", ""] },
    ),

    sectionTitle("FOOM H — Qulqulka Lacagta / Cash flow"),
    table(
      [{ header: "Saddex-biloodka" }, { header: "Baahida Lacagta", align: "right", width: 90 }, { header: "% Wadarta", align: "right", width: 60 }, { header: "Faallo", width: 150 }],
      sum.formH.rows.map((r, i) => [`${r.quarter}`, m(r.amount), pct(r.percentOfBudget), bundle.cashFlow[i]?.remarks ?? ""]),
      { totalRow: ["WADARTA", m(sum.formH.total), "", ""] },
    ),

    sectionTitle("HUBINTA TOOSAN — Validation"),
    table(
      [{ header: "Hubinta" }, { header: "Xisaabsan", align: "right", width: 75 }, { header: "La barbardhigayo", align: "right", width: 75 }, { header: "Faraqa", align: "right", width: 65 }, { header: "Natiijada", width: 55 }],
      bundle.checks.map((c) => [c.name, c.calculated === null ? "" : m(c.calculated), c.expected === null ? "" : m(c.expected), c.difference === null ? "" : m(c.difference), c.status]),
      { fontSize: 7 },
    ),

    sectionTitle("BAYAANKA XAQIIJINTA — Certification"),
    { text: `Waxaan caddeynayaa in xogta ku jirta foomamkan miisaaniyaddu ay dhammaystiran tahay, sax tahay, laguna diyaariyey si waafaqsan Wareegtada Diyaarinta Miisaaniyadda ${year}.`, italics: true, margin: [0, 0, 0, 6] },
    table(
      [{ header: "Door / Role", width: 150 }, { header: "Magaca / Name" }, { header: "Saxiixa / Signature" }],
      [
        ["Diyaariyey (Sarkaalka Miisaaniyadda)", cert?.preparedByName ?? "", cert?.preparedSignature ?? "—"],
        ["Dib u eegay (Agaasimaha Maaliyadda)", cert?.reviewedByName ?? "", cert?.reviewedSignature ?? "—"],
        ["Ansixiyey (Mas'uulka Xisaab-celinta)", cert?.approvedByName ?? "", cert?.approvedSignature ?? "—"],
        ["Kheyraadka Aadanaha (Foom E)", cert?.hrCertifiedByName ?? "", cert?.hrCertifiedAt ? cert.hrCertifiedAt.toISOString().slice(0, 16).replace("T", " ") : "—"],
      ],
      { fontSize: 7 },
    ),

    ...(extras.steps.length
      ? [
          sectionTitle("Taariikhda Ansixinta — Approval history"),
          table(
            [{ header: "Taariikh", width: 85 }, { header: "Ficil", width: 80 }, { header: "Xaalad", width: 70 }, { header: "Qofka", width: 100 }, { header: "Faallo" }],
            extras.steps.map((st) => [st.createdAt.toISOString().slice(0, 16).replace("T", " "), st.action, st.toStatus, st.actorName ?? "", st.comment ?? ""]),
            { fontSize: 7 },
          ),
        ]
      : []),
  ];

  return renderPdf(
    documentFrame(settings, {
      title: `Miisaaniyadda ${year} — ${s.mda.code} ${s.mda.name}`,
      subtitle: `Budget submission package · ${s.status}`,
      generatedBy: extras.generatedBy,
      generatedAt: extras.generatedAt,
      content,
    }),
  );
}

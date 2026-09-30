/**
 * DEVELOPMENT SEED DATA — the 2027 budget preparation cycle.
 *
 * Budgets are prepared through the real services (the same code paths as the UI):
 * agency officers fill Forms A–H, then reviewers, the director and the approval
 * authority move the budgets through the workflow. The result is a set of 2027
 * submissions in every workflow state plus a 2026 supplementary revision.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { loadActor } from "../../src/lib/auth/actor-loader";
import { calculatePersonnelCost, spreadAcrossQuarters, sum, toAmount } from "../../src/lib/calculations";
import { findEffectiveApproved, loadSubmissionBundle } from "../../src/lib/services/submission-data";
import {
  createRevision,
  createSubmission,
  saveFormA,
  saveFormC,
  saveFormD,
  saveFormE,
  saveFormF,
  saveFormG,
  saveFormH,
  signCertification,
  updateLine,
} from "../../src/lib/services/submissions";
import { performWorkflowAction } from "../../src/lib/services/workflow";
import { createRng, round } from "./rng";

/** Preferred leaf code for each level-4 code of the 2026 approved budgets. */
const LEAF_FOR: Record<string, string[]> = {
  "2111": ["211101"],
  "2113": ["211301"],
  "2211": ["221101", "221102", "221103"],
  "2221": ["222101", "222102"],
  "2222": ["222201", "222202"],
  "2223": ["222301", "222302"],
  "2224": ["222401", "222405"],
  "2225": ["222503", "222504"],
  "2231": ["223101", "223102"],
  "2244": ["224401"],
  "2251": ["225101"],
  "2261": ["226102"],
  "2631": ["263103"],
  "2711": ["2711"],
};

interface MdaPlan {
  mda: string;
  officer: string;
  growth: number;
  target: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "RETURNED" | "RECOMMENDED" | "ENDORSED" | "APPROVED";
  /** Leave some forms incomplete (the 10101 demo draft). */
  partial?: boolean;
  revenueCodes?: string[];
  projects?: { name: string; location: string; code: string; totalCost: number; spentToDate: number; allocation: number; funding: string; fundingType: "GOVERNMENT" | "DONOR" | "MIXED"; projectType: "NEW" | "ONGOING"; completion: string; justification: string }[];
}

const PLANS: MdaPlan[] = [
  {
    mda: "10101",
    officer: "officer.10101",
    growth: 1.06,
    target: "DRAFT",
    partial: true,
    projects: [
      { name: "Presidency ICT and records system", location: "Laascaanood", code: "311221", totalCost: 120_000, spentToDate: 0, allocation: 60_000, funding: "GOV", fundingType: "GOVERNMENT", projectType: "NEW", completion: "2028-06-30", justification: "Replace paper registry with a secure electronic records system." },
    ],
  },
  {
    mda: "40101",
    officer: "officer.40101",
    growth: 1.08,
    target: "SUBMITTED",
    revenueCodes: ["142237", "142247"],
    projects: [
      { name: "Laascaanood Regional Hospital maternity ward rehabilitation", location: "Laascaanood, Sool", code: "311121", totalCost: 450_000, spentToDate: 120_000, allocation: 150_000, funding: "WB", fundingType: "DONOR", projectType: "ONGOING", completion: "2028-06-30", justification: "Maternal mortality reduction programme; the existing ward is structurally unsafe." },
      { name: "Primary health centre equipment", location: "Buuhoodle, Cayn", code: "311221", totalCost: 80_000, spentToDate: 0, allocation: 80_000, funding: "GOV", fundingType: "GOVERNMENT", projectType: "NEW", completion: "2027-09-30", justification: "Equip the new primary health centre to open in Q3 2027." },
    ],
  },
  {
    mda: "40201",
    officer: "officer.40201",
    growth: 1.05,
    target: "UNDER_REVIEW",
    revenueCodes: ["142240", "142241"],
    projects: [
      { name: "Construction of four classrooms", location: "Taleex, Sool", code: "311121", totalCost: 160_000, spentToDate: 0, allocation: 100_000, funding: "EU", fundingType: "DONOR", projectType: "NEW", completion: "2028-03-31", justification: "Overcrowded classrooms (over 80 pupils per class)." },
    ],
  },
  {
    mda: "20501",
    officer: "officer.20501",
    growth: 1.04,
    target: "RETURNED",
    projects: [
      { name: "Police patrol vehicles", location: "Sool and Sanaag", code: "311211", totalCost: 210_000, spentToDate: 0, allocation: 210_000, funding: "GOV", fundingType: "GOVERNMENT", projectType: "NEW", completion: "2027-12-31", justification: "Replace six patrol vehicles older than ten years." },
    ],
  },
  { mda: "30201", officer: "officer.30201", growth: 1.1, target: "RECOMMENDED", revenueCodes: ["142229", "142231"] },
  { mda: "10301", officer: "officer.10301", growth: 1.05, target: "ENDORSED", revenueCodes: ["*"] },
  {
    mda: "30501",
    officer: "officer.30501",
    growth: 1.07,
    target: "APPROVED",
    projects: [
      { name: "Rural water points rehabilitation", location: "Cayn", code: "311121", totalCost: 95_000, spentToDate: 25_000, allocation: 50_000, funding: "UN", fundingType: "DONOR", projectType: "ONGOING", completion: "2027-12-31", justification: "Drought resilience: rehabilitate 12 shallow wells." },
    ],
  },
];

const POSITION_TEMPLATE = [
  { title: "Director General", grade: "A1", monthly: 1800, share: 0.02 },
  { title: "Director", grade: "A2", monthly: 1200, share: 0.08 },
  { title: "Senior Officer", grade: "B1", monthly: 700, share: 0.25 },
  { title: "Officer", grade: "B2", monthly: 450, share: 0.4 },
  { title: "Support Staff", grade: "C1", monthly: 250, share: 0.25 },
];

export async function seedPreparation(prisma: PrismaClient, users: Record<string, string>) {
  const rng = createRng(2027);
  const year2027 = await prisma.budgetYear.findUniqueOrThrow({ where: { year: 2027 } });
  const codes = await prisma.budgetCode.findMany({ select: { id: true, code: true, kind: true, categoryId: true } });
  const codeId = (kind: "REVENUE" | "EXPENDITURE", code: string) => codes.find((c) => c.kind === kind && c.code === code)?.id;
  const lookups = await prisma.lookupValue.findMany();
  const lookupId = (category: string, code: string) => lookups.find((l) => l.category === category && l.code === code)!.id;
  const categories = await prisma.budgetCategory.findMany();
  const catId = (code: string) => categories.find((c) => c.code === code)!.id;
  const actor = async (username: string) => loadActor(prisma, users[username]);
  const results: Record<string, string> = {};

  for (const plan of PLANS) {
    const mda = await prisma.mda.findUniqueOrThrow({ where: { code: plan.mda } });
    const officer = await actor(plan.officer);
    const submission = await createSubmission(officer, { budgetYearId: year2027.id, mdaId: mda.id, prefill: "EMPTY" });
    const rev = async () => (await prisma.budgetSubmission.findUniqueOrThrow({ where: { id: submission.id } })).updatedAt.toISOString();

    // ── Form A ───────────────────────────────────────────────────────────
    await saveFormA(
      officer,
      submission.id,
      {
        allocationNumber: mda.code,
        agencyCategory: (await prisma.sector.findUniqueOrThrow({ where: { id: mda.sectorId } })).name,
        accountingOfficer: mda.accountingOfficer ?? "Accounting Officer",
        contactPerson: mda.contactPerson ?? officer.name,
        telephone: mda.phone ?? "+252 90 700 0000",
        email: mda.email ?? `budget.${mda.code}@budget.dev.local`,
      },
      await rev(),
    );

    // ── Baseline: the 2026 approved budget ───────────────────────────────
    const prior = await findEffectiveApproved(prisma, mda.id, 2026);
    const priorLines = prior ? await prisma.budgetLine.findMany({ where: { submissionId: prior.id, kind: "EXPENDITURE" }, include: { budgetCode: true } }) : [];
    const personnel2026 = sum(priorLines.filter((l) => l.budgetCode.code.startsWith("21")).map((l) => l.amount));

    // ── Form E — positions sized to the personnel budget ─────────────────
    const targetPersonnel = personnel2026 * plan.growth;
    const avgAnnual = sum(POSITION_TEMPLATE.map((p) => p.monthly * 12 * p.share));
    const headcount = Math.max(5, Math.round(targetPersonnel / avgAnnual));
    const rows = POSITION_TEMPLATE.map((p, i) => {
      const filled = Math.max(1, Math.round(headcount * p.share));
      const establishment = filled + (i >= 2 ? rng.int(0, 3) : 0);
      return { positionTitle: p.title, grade: p.grade, department: i < 2 ? "Management" : "Operations", approvedEstablishment: establishment, filledPositions: filled, monthlyCost: round(p.monthly * rng.between(0.95, 1.08), 10), remarks: null, budgetCodeId: null };
    });
    if (plan.mda === "20501") rows[4].approvedEstablishment = rows[4].filledPositions - 2; // HR warning: filled above establishment
    const personnelTotal = sum(rows.map((r) => calculatePersonnelCost(r.filledPositions, r.monthlyCost)));
    await saveFormE(officer, submission.id, { rows }, await rev());

    // ── Form D — recurrent expenditure (leaf codes, grown from 2026) ─────
    const salaries = toAmount(round(personnelTotal * 0.75, 1));
    const lines: { budgetCodeId: string; description: string | null; amount: number; justification: string | null }[] = [
      { budgetCodeId: codeId("EXPENDITURE", "211101")!, description: "Salaries", amount: salaries, justification: null },
      { budgetCodeId: codeId("EXPENDITURE", "211301")!, description: "Allowances", amount: toAmount(personnelTotal - salaries), justification: null },
    ];
    for (const l of priorLines) {
      const leafs = LEAF_FOR[l.budgetCode.code];
      if (!leafs || l.budgetCode.code.startsWith("21")) continue;
      const total = Number(l.amount) * plan.growth * rng.between(0.97, 1.05);
      leafs.forEach((leaf, i) => {
        const id = codeId("EXPENDITURE", leaf);
        if (!id || lines.some((x) => x.budgetCodeId === id)) return;
        const amount = round(i === leafs.length - 1 ? total - round(total / leafs.length) * (leafs.length - 1) : total / leafs.length);
        if (amount > 0) lines.push({ budgetCodeId: id, description: null, amount, justification: null });
      });
    }
    const categoryNotes: Record<string, string> = {
      [catId("PERSONNEL")]: "Annual increments and filling of approved vacancies.",
      [catId("GOODS_SERVICES")]: "Inflation adjustment for office supplies and rent.",
    };
    if (!plan.partial) {
      categoryNotes[catId("BASIC_SERVICES")] = "Utility tariffs increased in 2026.";
      categoryNotes[catId("TRAVEL_TRANSPORT")] = "Field supervision in Sool, Sanaag and Cayn.";
      categoryNotes[catId("OPERATIONS_MAINTENANCE")] = "Ageing vehicle fleet requires more maintenance.";
      categoryNotes[catId("OTHER_RECURRENT")] = "Contingency held at the 2026 level.";
    }
    await saveFormD(officer, submission.id, { lines, categoryNotes }, await rev());

    // ── Form C — revenue estimates ────────────────────────────────────────
    if (plan.revenueCodes?.length) {
      const prevRevenue = prior ? await prisma.budgetLine.findMany({ where: { submissionId: prior.id, kind: "REVENUE" }, include: { budgetCode: true } }) : [];
      const revLines =
        plan.revenueCodes[0] === "*"
          ? prevRevenue.filter((l) => Number(l.amount) > 0).map((l) => ({ code: l.budgetCode.code, base: Number(l.amount) }))
          : plan.revenueCodes.map((c) => ({ code: c, base: round(rng.between(20_000, 90_000), 1000) }));
      await saveFormC(
        officer,
        submission.id,
        {
          lines: revLines
            .map((l) => ({
              budgetCodeId: codeId("REVENUE", l.code)!,
              description: null,
              amount: round(l.base * plan.growth, 100),
              priorYearActual: round(l.base * rng.between(0.82, 0.98), 100),
              currentYearEstimate: round(l.base * rng.between(0.9, 1.04), 100),
              justification: null,
            }))
            .filter((l) => l.budgetCodeId),
          categoryNotes: { [catId("TAXES")]: "Improved customs automation at the ports.", [catId("FEES")]: "Tariff review approved by cabinet.", [catId("LICENSES")]: "New licence categories.", [catId("OTHER_REVENUE")]: "Grant pipeline confirmed with partners." },
          noRevenue: false,
        },
        await rev(),
      );
    } else if (!plan.partial) {
      await saveFormC(officer, submission.id, { lines: [], categoryNotes: {}, noRevenue: true }, await rev());
    }

    // ── Form F — capital projects ─────────────────────────────────────────
    if (plan.projects?.length) {
      await saveFormF(
        officer,
        submission.id,
        {
          rows: plan.projects.map((p) => ({
            name: p.name,
            location: p.location,
            description: null,
            justification: p.justification,
            projectCode: null,
            budgetCodeId: codeId("EXPENDITURE", p.code)!,
            totalCost: p.totalCost,
            spentToDate: p.spentToDate,
            allocation: p.allocation,
            fundingSourceId: lookupId("FUNDING_SOURCE", p.funding),
            fundingType: p.fundingType,
            projectType: p.projectType,
            isMultiYear: p.totalCost > p.allocation,
            startYear: p.projectType === "ONGOING" ? 2025 : 2027,
            expectedCompletionDate: p.completion,
            status: "PROPOSED",
          })),
          noCapital: false,
        },
        await rev(),
      );
    } else if (!plan.partial) {
      await saveFormF(officer, submission.id, { rows: [], noCapital: true }, await rev());
    }

    if (!plan.partial) {
      // ── Form G — procurement plan within eligible budgets ──────────────
      const bundle = await loadSubmissionBundle(prisma, submission.id);
      const gs = bundle.summary.formD.rows.find((r) => r.key === "GOODS_SERVICES")?.proposed ?? 0;
      const projects = bundle.capital.filter((c) => c.projectId);
      await saveFormG(
        officer,
        submission.id,
        {
          rows: [
            { itemDescription: "Office stationery and consumables (framework contract)", estimatedCost: round(gs * 0.25), procurementMethodId: lookupId("PROCUREMENT_METHOD", "FRAMEWORK"), quarter: "Q1" as const, responsibleDepartment: "Administration and Finance", budgetCategoryId: catId("GOODS_SERVICES"), capitalProjectId: null, remarks: null },
            { itemDescription: "ICT consumables and computer accessories", estimatedCost: round(gs * 0.1), procurementMethodId: lookupId("PROCUREMENT_METHOD", "RFQ"), quarter: "Q2" as const, responsibleDepartment: "ICT Unit", budgetCategoryId: catId("GOODS_SERVICES"), capitalProjectId: null, remarks: null },
            ...projects.map((p, i) => ({
              itemDescription: `Works / supply contract: ${p.name}`,
              estimatedCost: round(p.allocation * 0.8),
              procurementMethodId: lookupId("PROCUREMENT_METHOD", "ONB"),
              quarter: (i % 2 === 0 ? "Q2" : "Q3") as "Q2" | "Q3",
              responsibleDepartment: "Procurement Unit",
              budgetCategoryId: null,
              capitalProjectId: p.projectId,
              remarks: null,
            })),
          ].filter((r) => r.estimatedCost > 0),
          noProcurement: false,
        },
        await rev(),
      );

      // ── Form H — cash flow equal to the total budget ────────────────────
      const after = await loadSubmissionBundle(prisma, submission.id);
      const q = spreadAcrossQuarters(after.summary.totals.expenditure);
      await saveFormH(officer, submission.id, { rows: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ quarter, amount: q[quarter], remarks: null })) }, await rev());
    }

    // ── Certification and workflow ─────────────────────────────────────────
    if (plan.mda === "10101") {
      await signCertification(await actor("finance.10101"), submission.id, "REVIEWED");
    }
    const act = async (username: string, action: "SUBMIT" | "START_REVIEW" | "RECOMMEND" | "ENDORSE" | "APPROVE" | "RETURN", comment?: string, corrections: { form: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H"; section: string; comment: string; requiredCorrection: string }[] = []) =>
      performWorkflowAction(await actor(username), { submissionId: submission.id, action, comment: comment ?? null, corrections: corrections.map((c) => ({ ...c, field: null })) });

    const order = ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED", "APPROVED"];
    const reach = plan.target === "RETURNED" ? 1 : order.indexOf(plan.target);
    if (reach >= 0) await act(plan.officer, "SUBMIT");
    if (reach >= 1) await act("reviewer", "START_REVIEW");
    if (plan.target === "RETURNED") {
      await act("reviewer", "RETURN", "Personnel establishment and procurement timing need correction before recommendation.", [
        { form: "E", section: "Support Staff", comment: "Filled positions exceed the approved establishment for Support Staff.", requiredCorrection: "Reduce filled positions to the approved establishment or attach the approval for additional posts." },
        { form: "G", section: "Police patrol vehicles", comment: "Vehicle procurement is planned in Q2 but no specification is attached.", requiredCorrection: "Attach the vehicle specification and confirm the procurement quarter." },
      ]);
    }
    if (reach >= 2 && plan.target !== "RETURNED") await act("reviewer", "RECOMMEND", "Consistent with the 2027 ceilings.");
    if (reach >= 3) await act("director", "ENDORSE", "Endorsed for final approval.");
    if (reach >= 4) await act("approver", "APPROVE", "Approved.");
    results[plan.mda] = submission.id;
  }

  // ── A 2026 supplementary revision in progress (Ministry of Health) ─────────
  const health = await prisma.mda.findUniqueOrThrow({ where: { code: "40101" } });
  const approved2026 = await findEffectiveApproved(prisma, health.id, 2026);
  if (approved2026) {
    const officer = await actor("officer.40101");
    const revision = await createRevision(officer, { submissionId: approved2026.id, revisionType: "SUPPLEMENTARY", reason: "Cholera outbreak response: additional medical supplies and outreach travel for Q4 2026." });
    const utilities = await prisma.budgetLine.findFirst({ where: { submissionId: revision.id, budgetCode: { code: "2221" } } });
    const travel = await prisma.budgetLine.findFirst({ where: { submissionId: revision.id, budgetCode: { code: "2211" } } });
    if (travel) await updateLine(officer, { lineId: travel.id, amount: toAmount(Number(travel.amount) + 25_000), justification: "Outbreak outreach teams (Q4 2026)" });
    if (utilities) await updateLine(officer, { lineId: utilities.id, amount: toAmount(Number(utilities.amount) + 5_000), justification: "Cholera treatment centre utilities" });
    results["40101-revision-2026"] = revision.id;
  }
  return results;
}

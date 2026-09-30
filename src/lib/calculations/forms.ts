/**
 * Form calculations for the official budget preparation forms (Foom 4, Forms A–H).
 *
 * The business rules reproduce the formulas of the official template:
 *  - Form B is a derived summary: Personnel and Goods & Services come from the
 *    corresponding Form D categories, Capital from Form F, and Other Expenditure
 *    from the remaining recurrent categories (template: C20 = SUM(C36:C39)).
 *  - Form C totals revenue categories (template row 30).
 *  - Form D totals recurrent expenditure categories (template row 40).
 *  - Form E annual cost = filled × monthly × 12 (template F44).
 *  - Form F totals capital allocations (template row 69).
 *  - Form G totals the procurement plan (template row 85).
 *  - Form H quarter share = quarter / total (template D89). Per the system
 *    specification the share is measured against the total budget (Form B), falling
 *    back to the cash-flow total when the budget is zero.
 */
import { calculateChange, calculatePercent, calculatePersonnelCost, QUARTERS, type QuarterKey } from "./budget";
import { type Numeric, sum, sumBy, toAmount } from "./money";

export type SummaryGroupKey = "PERSONNEL" | "GOODS_SERVICES" | "CAPITAL" | "OTHER";
export const SUMMARY_GROUPS: readonly SummaryGroupKey[] = ["PERSONNEL", "GOODS_SERVICES", "CAPITAL", "OTHER"];

export interface CategoryDef {
  id: string;
  code: string;
  name: string;
  nameSo: string;
  kind: "REVENUE" | "EXPENDITURE";
  summaryGroup: SummaryGroupKey | null;
  isCapital: boolean;
  procurementEligible: boolean;
  sortOrder: number;
}

export interface LineData {
  id?: string;
  budgetCodeId?: string;
  categoryId: string | null;
  amount: Numeric;
  priorYearActual?: Numeric;
  currentYearEstimate?: Numeric;
  justification?: string | null;
}

export interface PersonnelData {
  id?: string;
  positionTitle: string;
  grade?: string | null;
  approvedEstablishment: Numeric;
  filledPositions: Numeric;
  monthlyCost: Numeric;
  /** Stored annual cost (checked against the recomputed value). */
  annualCost?: Numeric;
}

export interface CapitalData {
  id?: string;
  projectId: string;
  name: string;
  totalCost: Numeric;
  spentToDate?: Numeric;
  allocation: Numeric;
  priorApproved?: Numeric;
  fundingSourceId?: string | null;
  expectedCompletionDate?: string | Date | null;
  justification?: string | null;
  location?: string | null;
}

export interface ProcurementData {
  id?: string;
  itemDescription: string;
  estimatedCost: Numeric;
  quarter: QuarterKey | null;
  procurementMethodId?: string | null;
  budgetCategoryId?: string | null;
  capitalProjectId?: string | null;
}

export interface CashFlowData {
  quarter: QuarterKey;
  amount: Numeric;
}

export interface FormAData {
  agencyName?: string | null;
  allocationNumber?: string | null;
  agencyCategory?: string | null;
  accountingOfficer?: string | null;
  contactPerson?: string | null;
  telephone?: string | null;
  email?: string | null;
}

/** Everything needed to compute the forms for one submission. */
export interface SubmissionData {
  categories: CategoryDef[];
  formA: FormAData;
  expenditureLines: LineData[];
  revenueLines: LineData[];
  capital: CapitalData[];
  personnel: PersonnelData[];
  procurement: ProcurementData[];
  cashFlow: CashFlowData[];
  /** Prior-year approved amounts from the system (e.g. 2026 Approved), by category id. */
  baseline: {
    expenditureByCategory: Record<string, number>;
    revenueByCategory: Record<string, number>;
    capitalApproved: number;
  };
  /** Keys of justification notes present (Form B/C/D category explanations). */
  notes: Record<string, string>;
}

export interface ComparisonRow {
  key: string;
  label: string;
  labelSo: string;
  approved: number;
  proposed: number;
  change: number;
  changePercent: number | null;
}

export interface RevenueRow {
  categoryId: string;
  label: string;
  labelSo: string;
  priorYearActual: number;
  currentApproved: number;
  currentPerformance: number;
  estimate: number;
  change: number;
  changePercent: number | null;
}

export interface PersonnelRow {
  positionTitle: string;
  approvedEstablishment: number;
  filledPositions: number;
  monthlyCost: number;
  annualCost: number;
}

export interface CashFlowRow {
  quarter: QuarterKey;
  amount: number;
  percentOfBudget: number | null;
  percentOfCashFlow: number | null;
}

export interface SubmissionSummary {
  formB: { rows: ComparisonRow[]; total: ComparisonRow };
  formC: { rows: RevenueRow[]; total: Omit<RevenueRow, "categoryId" | "label" | "labelSo"> };
  formD: { rows: (ComparisonRow & { categoryId: string; summaryGroup: SummaryGroupKey | null })[]; total: ComparisonRow };
  formE: {
    rows: PersonnelRow[];
    totalEstablishment: number;
    totalFilled: number;
    totalMonthly: number;
    totalAnnual: number;
  };
  formF: { totalProjectCost: number; totalAllocation: number; totalPriorApproved: number; projectCount: number };
  formG: { total: number; byQuarter: Record<QuarterKey, number>; byCategory: Record<string, number>; itemCount: number };
  formH: { rows: CashFlowRow[]; total: number };
  totals: {
    revenue: number;
    expenditure: number;
    recurrent: number;
    personnel: number;
    goodsServices: number;
    capital: number;
    other: number;
    /** Budget eligible to fund procurement: procurement-eligible categories + capital. */
    procurementEligible: number;
  };
}

const GROUP_LABELS: Record<SummaryGroupKey, { en: string; so: string }> = {
  PERSONNEL: { en: "Personnel", so: "Shaqaalaha" },
  GOODS_SERVICES: { en: "Goods and Services", so: "Agabyada iyo adeegyada" },
  CAPITAL: { en: "Capital Expenditure", so: "Kharashaadka raasamaalka" },
  OTHER: { en: "Other Expenditure", so: "Kharashaad kale" },
};

export function summaryGroupLabel(group: SummaryGroupKey, locale: "en" | "so" = "en"): string {
  return GROUP_LABELS[group][locale];
}

function comparison(key: string, label: string, labelSo: string, approved: Numeric, proposed: Numeric): ComparisonRow {
  const change = calculateChange(proposed, approved);
  return {
    key,
    label,
    labelSo,
    approved: toAmount(approved),
    proposed: toAmount(proposed),
    change: change.amount,
    changePercent: change.percent,
  };
}

export function computeSubmissionSummary(data: SubmissionData): SubmissionSummary {
  const categories = [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const expenditureCategories = categories.filter((c) => c.kind === "EXPENDITURE" && !c.isCapital);
  const revenueCategories = categories.filter((c) => c.kind === "REVENUE");
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // ── Form D — recurrent expenditure by category ───────────────────────────
  const formDRows = expenditureCategories.map((cat) => {
    const proposed = sumBy(
      data.expenditureLines.filter((l) => l.categoryId === cat.id),
      (l) => l.amount,
    );
    const approved = data.baseline.expenditureByCategory[cat.id] ?? 0;
    return { ...comparison(cat.code, cat.name, cat.nameSo, approved, proposed), categoryId: cat.id, summaryGroup: cat.summaryGroup };
  });
  // Lines whose category is missing or capital are not recurrent; they are surfaced by validation.
  const formDTotal = comparison(
    "TOTAL_RECURRENT",
    "Total Recurrent Expenditure",
    "Wadarta kharashaadka joogtada ah",
    sumBy(formDRows, (r) => r.approved),
    sumBy(formDRows, (r) => r.proposed),
  );

  // ── Form F — capital projects ────────────────────────────────────────────
  const totalAllocation = sumBy(data.capital, (c) => c.allocation);
  const totalPriorApproved = sumBy(data.capital, (c) => c.priorApproved);
  const formF = {
    totalProjectCost: sumBy(data.capital, (c) => c.totalCost),
    totalAllocation,
    totalPriorApproved,
    projectCount: data.capital.length,
  };
  const capitalApproved = data.baseline.capitalApproved ?? totalPriorApproved;

  // ── Form B — derived agency budget summary ──────────────────────────────
  const groupTotals = (group: SummaryGroupKey, field: "approved" | "proposed") =>
    sumBy(
      formDRows.filter((r) => r.summaryGroup === group),
      (r) => r[field],
    );
  const otherApproved = sumBy(
    formDRows.filter((r) => r.summaryGroup !== "PERSONNEL" && r.summaryGroup !== "GOODS_SERVICES"),
    (r) => r.approved,
  );
  const otherProposed = sumBy(
    formDRows.filter((r) => r.summaryGroup !== "PERSONNEL" && r.summaryGroup !== "GOODS_SERVICES"),
    (r) => r.proposed,
  );
  const formBRows: ComparisonRow[] = [
    comparison("PERSONNEL", GROUP_LABELS.PERSONNEL.en, GROUP_LABELS.PERSONNEL.so, groupTotals("PERSONNEL", "approved"), groupTotals("PERSONNEL", "proposed")),
    comparison(
      "GOODS_SERVICES",
      GROUP_LABELS.GOODS_SERVICES.en,
      GROUP_LABELS.GOODS_SERVICES.so,
      groupTotals("GOODS_SERVICES", "approved"),
      groupTotals("GOODS_SERVICES", "proposed"),
    ),
    comparison("CAPITAL", GROUP_LABELS.CAPITAL.en, GROUP_LABELS.CAPITAL.so, capitalApproved, totalAllocation),
    comparison("OTHER", GROUP_LABELS.OTHER.en, GROUP_LABELS.OTHER.so, otherApproved, otherProposed),
  ];
  const formBTotal = comparison(
    "TOTAL",
    "Total Budget",
    "Wadarta miisaaniyadda",
    sumBy(formBRows, (r) => r.approved),
    sumBy(formBRows, (r) => r.proposed),
  );

  // ── Form C — revenue estimates by category ──────────────────────────────
  const formCRows: RevenueRow[] = revenueCategories.map((cat) => {
    const lines = data.revenueLines.filter((l) => l.categoryId === cat.id);
    const estimate = sumBy(lines, (l) => l.amount);
    const currentApproved = data.baseline.revenueByCategory[cat.id] ?? 0;
    const change = calculateChange(estimate, currentApproved);
    return {
      categoryId: cat.id,
      label: cat.name,
      labelSo: cat.nameSo,
      priorYearActual: sumBy(lines, (l) => l.priorYearActual),
      currentApproved,
      currentPerformance: sumBy(lines, (l) => l.currentYearEstimate),
      estimate,
      change: change.amount,
      changePercent: change.percent,
    };
  });
  const revenueTotalEstimate = sumBy(formCRows, (r) => r.estimate);
  const revenueTotalApproved = sumBy(formCRows, (r) => r.currentApproved);
  const revenueChange = calculateChange(revenueTotalEstimate, revenueTotalApproved);
  const formCTotal = {
    priorYearActual: sumBy(formCRows, (r) => r.priorYearActual),
    currentApproved: revenueTotalApproved,
    currentPerformance: sumBy(formCRows, (r) => r.currentPerformance),
    estimate: revenueTotalEstimate,
    change: revenueChange.amount,
    changePercent: revenueChange.percent,
  };

  // ── Form E — personnel ───────────────────────────────────────────────────
  const personnelRows: PersonnelRow[] = data.personnel.map((p) => ({
    positionTitle: p.positionTitle,
    approvedEstablishment: toAmount(p.approvedEstablishment),
    filledPositions: toAmount(p.filledPositions),
    monthlyCost: toAmount(p.monthlyCost),
    annualCost: calculatePersonnelCost(p.filledPositions, p.monthlyCost),
  }));
  const formE = {
    rows: personnelRows,
    totalEstablishment: sumBy(personnelRows, (r) => r.approvedEstablishment),
    totalFilled: sumBy(personnelRows, (r) => r.filledPositions),
    totalMonthly: sumBy(personnelRows, (r) => r.monthlyCost),
    totalAnnual: sumBy(personnelRows, (r) => r.annualCost),
  };

  // ── Form G — procurement ─────────────────────────────────────────────────
  const byQuarter = Object.fromEntries(
    QUARTERS.map((q) => [q, sumBy(data.procurement.filter((p) => p.quarter === q), (p) => p.estimatedCost)]),
  ) as Record<QuarterKey, number>;
  const byCategory: Record<string, number> = {};
  for (const item of data.procurement) {
    const key = item.capitalProjectId ? "CAPITAL" : item.budgetCategoryId ?? "UNASSIGNED";
    byCategory[key] = sum([byCategory[key] ?? 0, item.estimatedCost]);
  }
  const formG = {
    total: sumBy(data.procurement, (p) => p.estimatedCost),
    byQuarter,
    byCategory,
    itemCount: data.procurement.length,
  };

  // ── Totals ───────────────────────────────────────────────────────────────
  const recurrent = formDTotal.proposed;
  const capital = totalAllocation;
  const expenditure = formBTotal.proposed;
  const procurementEligible = sum([
    ...formDRows.filter((r) => categoryById.get(r.categoryId)?.procurementEligible).map((r) => r.proposed),
    capital,
  ]);

  // ── Form H — quarterly cash flow ─────────────────────────────────────────
  const cashTotal = sumBy(data.cashFlow, (c) => c.amount);
  const formHRows: CashFlowRow[] = QUARTERS.map((q) => {
    const amount = sumBy(data.cashFlow.filter((c) => c.quarter === q), (c) => c.amount);
    return {
      quarter: q,
      amount,
      percentOfBudget: calculatePercent(amount, expenditure) ?? calculatePercent(amount, cashTotal),
      percentOfCashFlow: calculatePercent(amount, cashTotal),
    };
  });

  return {
    formB: { rows: formBRows, total: formBTotal },
    formC: { rows: formCRows, total: formCTotal },
    formD: { rows: formDRows, total: formDTotal },
    formE,
    formF,
    formG,
    formH: { rows: formHRows, total: cashTotal },
    totals: {
      revenue: revenueTotalEstimate,
      expenditure,
      recurrent,
      personnel: formBRows[0].proposed,
      goodsServices: formBRows[1].proposed,
      capital,
      other: formBRows[3].proposed,
      procurementEligible,
    },
  };
}

/** Form completion (0–100) per form, used by the workspace progress indicator. */
export function computeFormCompletion(data: SubmissionData, summary: SubmissionSummary): Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", number> {
  const a = data.formA;
  const formAFields = [a.allocationNumber, a.agencyCategory, a.accountingOfficer, a.contactPerson, a.telephone, a.email];
  const formA = Math.round((formAFields.filter((f) => f && String(f).trim() !== "").length / formAFields.length) * 100);

  const formDRowsWithAmount = summary.formD.rows.filter((r) => r.proposed > 0).length;
  const formD = summary.formD.rows.length === 0 ? 0 : summary.formD.total.proposed > 0 ? Math.max(50, Math.round((formDRowsWithAmount / summary.formD.rows.length) * 100)) : 0;

  const formB = summary.formB.total.proposed > 0 ? 100 : 0;
  const formC = data.revenueLines.length > 0 ? 100 : data.notes["C:NO_REVENUE"] ? 100 : 0;

  const personnelComplete = data.personnel.filter(
    (p) => p.positionTitle.trim() !== "" && Number(p.filledPositions) >= 0 && toAmount(p.monthlyCost) > 0,
  ).length;
  const formE = data.personnel.length === 0 ? (summary.formB.rows[0].proposed > 0 ? 0 : 100) : Math.round((personnelComplete / data.personnel.length) * 100);

  const capitalComplete = data.capital.filter((c) => c.fundingSourceId && c.expectedCompletionDate && c.justification).length;
  const formF = data.capital.length === 0 ? (data.notes["F:NO_CAPITAL"] ? 100 : 0) : Math.round((capitalComplete / data.capital.length) * 100);

  const procurementComplete = data.procurement.filter((p) => p.quarter && p.procurementMethodId && toAmount(p.estimatedCost) > 0).length;
  const formG = data.procurement.length === 0 ? (data.notes["G:NO_PROCUREMENT"] ? 100 : 0) : Math.round((procurementComplete / data.procurement.length) * 100);

  const quartersFilled = data.cashFlow.filter((c) => toAmount(c.amount) > 0).length;
  const formH = Math.round((quartersFilled / 4) * 100);

  return { A: formA, B: formB, C: formC, D: formD, E: formE, F: formF, G: formG, H: formH };
}

export function overallCompletion(perForm: Record<string, number>): number {
  const values = Object.values(perForm);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Budget Validation Center — cross-form consistency and completeness checks.
 *
 * The first five checks reproduce the official template's "HUBINTA TOOSAN —
 * ISKU-WAAFAJINTA FOOMAMKA" block (rows 97–101). Rule severity, tolerance and
 * parameters come from the `validation_rules` table so administrators can tune
 * them; the logic lives here and runs on the server for every save and submit.
 */
import { calculatePersonnelCost, QUARTERS } from "./budget";
import type { SubmissionData, SubmissionSummary } from "./forms";
import { isNegative, subtract, sum, toAmount, withinTolerance } from "./money";

export type Severity = "ERROR" | "WARNING" | "INFO";
export type CheckStatus = "PASS" | "WARNING" | "ERROR";
export type FormKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "VALIDATION" | "CERTIFICATION" | "GENERAL";
export type Locale = "en" | "so";

export interface RuleConfig {
  code: RuleCode;
  severity: Severity;
  isActive: boolean;
  tolerance: number;
  params?: Record<string, unknown> | null;
}

export interface CheckResult {
  ruleCode: RuleCode;
  name: string;
  status: CheckStatus;
  severity: Severity;
  calculated: number | null;
  expected: number | null;
  difference: number | null;
  message: string;
  action: string | null;
  form: FormKey;
  field: string | null;
  details: string[];
  sortOrder: number;
}

export interface ValidationContext {
  locale?: Locale;
  /** Whether the prepared-by certification has been signed. */
  certificationPrepared?: boolean;
  /** Currency symbol used in detail messages (default "$"). */
  currencySymbol?: string;
}

export const RULE_CODES = [
  "FORM_A_COMPLETE",
  "BUDGET_NOT_EMPTY",
  "NON_NEGATIVE_AMOUNTS",
  "PERSONNEL_CONSISTENCY",
  "TOTAL_BUDGET_CONSISTENCY",
  "CASH_FLOW_CONSISTENCY",
  "CASH_FLOW_ALL_QUARTERS",
  "PROCUREMENT_LIMIT",
  "PROCUREMENT_CATEGORY_LIMIT",
  "PROCUREMENT_ITEMS_COMPLETE",
  "BALANCED_BUDGET",
  "PERSONNEL_ESTABLISHMENT",
  "PERSONNEL_MONTHLY_COST",
  "PERSONNEL_DUPLICATES",
  "PERSONNEL_ANNUAL_CALCULATION",
  "CAPITAL_ALLOCATION_WITHIN_COST",
  "CAPITAL_PROJECT_DETAILS",
  "CHANGE_JUSTIFICATION",
  "REVENUE_EXPLANATION",
  "CASH_FLOW_PROCUREMENT_TIMING",
  "CERTIFICATION_PREPARED",
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

interface RuleMeta {
  form: FormKey;
  field: string | null;
  name: Record<Locale, string>;
  description: string;
  defaultSeverity: Severity;
  defaultParams?: Record<string, unknown>;
}

/** Default rule catalogue (seeded into validation_rules). */
export const RULE_CATALOGUE: Record<RuleCode, RuleMeta> = {
  FORM_A_COMPLETE: {
    form: "A",
    field: null,
    name: { en: "Agency summary complete", so: "Soo-koobidda hay'adda oo dhammaystiran" },
    description: "All Form A fields (allocation number, category, accounting officer, contact person, telephone, email) are completed.",
    defaultSeverity: "ERROR",
  },
  BUDGET_NOT_EMPTY: {
    form: "D",
    field: null,
    name: { en: "Budget has expenditure", so: "Miisaaniyaddu waxay leedahay kharash" },
    description: "The proposed total budget must be greater than zero.",
    defaultSeverity: "ERROR",
  },
  NON_NEGATIVE_AMOUNTS: {
    form: "GENERAL",
    field: null,
    name: { en: "No negative amounts", so: "Ma jiraan tirooyin taban" },
    description: "Budget, personnel, procurement and cash-flow amounts may not be negative.",
    defaultSeverity: "ERROR",
  },
  PERSONNEL_CONSISTENCY: {
    form: "E",
    field: "personnelTotal",
    name: { en: "Personnel budget (Form D = Form E)", so: "Kharashka shaqaalaha (Foom D) = Wadarta Foom E" },
    description: "Form D personnel expenditure must equal the Form E personnel total.",
    defaultSeverity: "ERROR",
  },
  TOTAL_BUDGET_CONSISTENCY: {
    form: "B",
    field: "total",
    name: { en: "Total budget (Form B = Recurrent + Capital)", so: "Wadarta Foom B = Joogto (Foom D) + Raasamaal (Foom F)" },
    description: "Form B total must equal recurrent expenditure (Form D) plus capital expenditure (Form F).",
    defaultSeverity: "ERROR",
  },
  CASH_FLOW_CONSISTENCY: {
    form: "H",
    field: "total",
    name: { en: "Cash flow (Form H = Form B)", so: "Qulqulka lacagta (Foom H) = Wadarta Miisaaniyadda (Foom B)" },
    description: "The quarterly cash-flow total must equal the total budget.",
    defaultSeverity: "ERROR",
  },
  CASH_FLOW_ALL_QUARTERS: {
    form: "H",
    field: null,
    name: { en: "Cash flow covers all quarters", so: "Qulqulka lacagta wuxuu daboolayaa dhammaan saddex-biloodyada" },
    description: "Every quarter must have a cash-flow allocation when the budget is not zero.",
    defaultSeverity: "ERROR",
  },
  PROCUREMENT_LIMIT: {
    form: "G",
    field: "total",
    name: { en: "Procurement within eligible budget", so: "Qorshaha iibsiga (Foom G) ≤ Agab+Adeeg+Raasamaal" },
    description: "The procurement plan may not exceed goods & services, basic services and capital budgets.",
    defaultSeverity: "ERROR",
  },
  PROCUREMENT_CATEGORY_LIMIT: {
    form: "G",
    field: null,
    name: { en: "Procurement within category budgets", so: "Iibsiga ku jira xadka qaybaha miisaaniyadda" },
    description: "Procurement items linked to a budget category may not exceed that category's proposed budget.",
    defaultSeverity: "WARNING",
  },
  PROCUREMENT_ITEMS_COMPLETE: {
    form: "G",
    field: null,
    name: { en: "Procurement items complete", so: "Shayada iibsiga oo dhammaystiran" },
    description: "Every procurement item needs a description, cost, method and quarter.",
    defaultSeverity: "ERROR",
  },
  BALANCED_BUDGET: {
    form: "C",
    field: "total",
    name: { en: "Revenue equals expenditure", so: "Dakhliga 2027 (Foom C) = Kharashka 2027 (Foom B)" },
    description: "Balanced budget rule: estimated revenue equals proposed expenditure. Severity is configurable.",
    defaultSeverity: "WARNING",
  },
  PERSONNEL_ESTABLISHMENT: {
    form: "E",
    field: "filledPositions",
    name: { en: "Filled positions within establishment", so: "Jagooyinka la buuxiyey ≤ qaab-dhismeedka la ansixiyey" },
    description: "Filled positions may not exceed the approved establishment.",
    defaultSeverity: "WARNING",
  },
  PERSONNEL_MONTHLY_COST: {
    form: "E",
    field: "monthlyCost",
    name: { en: "Monthly cost provided", so: "Kharashka bishii waa la geliyey" },
    description: "Every position with filled posts needs a monthly cost.",
    defaultSeverity: "WARNING",
  },
  PERSONNEL_DUPLICATES: {
    form: "E",
    field: "positionTitle",
    name: { en: "No duplicate positions", so: "Jagooyin isku soo noqnoqday ma jiraan" },
    description: "The same position title and grade should appear only once.",
    defaultSeverity: "WARNING",
  },
  PERSONNEL_ANNUAL_CALCULATION: {
    form: "E",
    field: "annualCost",
    name: { en: "Annual cost calculation", so: "Xisaabinta kharashka sannadka" },
    description: "Annual cost must equal filled positions × monthly cost × 12.",
    defaultSeverity: "ERROR",
  },
  CAPITAL_ALLOCATION_WITHIN_COST: {
    form: "F",
    field: "allocation",
    name: { en: "Allocation within project cost", so: "Qoondaynta ku jirta kharashka mashruuca" },
    description: "Amount spent to date plus this year's allocation may not exceed the total project cost.",
    defaultSeverity: "ERROR",
  },
  CAPITAL_PROJECT_DETAILS: {
    form: "F",
    field: null,
    name: { en: "Capital project details", so: "Faahfaahinta mashaariicda raasamaalka" },
    description: "Projects need a funding source, expected completion date and justification.",
    defaultSeverity: "WARNING",
  },
  CHANGE_JUSTIFICATION: {
    form: "D",
    field: "justification",
    name: { en: "Large changes justified", so: "Isbeddelada waaweyn waa la sababeeyey" },
    description: "Expenditure categories changing by more than the threshold need a justification.",
    defaultSeverity: "WARNING",
    defaultParams: { thresholdPercent: 20 },
  },
  REVENUE_EXPLANATION: {
    form: "C",
    field: "explanation",
    name: { en: "Revenue changes explained", so: "Isbeddelada dakhliga waa la sharaxay" },
    description: "Revenue categories changing by more than the threshold need an explanation.",
    defaultSeverity: "WARNING",
    defaultParams: { thresholdPercent: 20 },
  },
  CASH_FLOW_PROCUREMENT_TIMING: {
    form: "H",
    field: null,
    name: { en: "Cash flow covers procurement timing", so: "Qulqulka lacagta wuxuu daboolayaa waqtiga iibsiga" },
    description: "Each quarter's cash requirement should cover the procurement planned in that quarter.",
    defaultSeverity: "WARNING",
  },
  CERTIFICATION_PREPARED: {
    form: "CERTIFICATION",
    field: null,
    name: { en: "Prepared-by certification", so: "Caddaynta diyaariyaha" },
    description: "The budget officer's certification is signed (it is signed automatically on submission).",
    defaultSeverity: "INFO",
  },
};

const MESSAGES = {
  pass: { en: "Consistent", so: "WAAFAQSAN" },
  mismatch: { en: "Mismatch — review", so: "KALA DUWAN - dib u eeg" },
  exceeds: { en: "Exceeds limit — review", so: "KA BADAN XADKA - dib u eeg" },
} as const;

function ruleName(code: RuleCode, locale: Locale) {
  return RULE_CATALOGUE[code].name[locale];
}

export function defaultRuleConfigs(): RuleConfig[] {
  return RULE_CODES.map((code) => ({
    code,
    severity: RULE_CATALOGUE[code].defaultSeverity,
    isActive: true,
    tolerance: 1,
    params: RULE_CATALOGUE[code].defaultParams ?? null,
  }));
}

function statusFor(passed: boolean, severity: Severity): CheckStatus {
  // Informational rules never block or warn; their message explains the situation.
  if (passed || severity === "INFO") return "PASS";
  return severity === "ERROR" ? "ERROR" : "WARNING";
}

/**
 * Run every active validation rule against a submission.
 * `summary` must come from computeSubmissionSummary(data).
 */
export function validateBudgetConsistency(
  data: SubmissionData,
  summary: SubmissionSummary,
  rules: RuleConfig[] = defaultRuleConfigs(),
  context: ValidationContext = {},
): CheckResult[] {
  const locale: Locale = context.locale ?? "en";
  const L = (en: string, so: string) => (locale === "so" ? so : en);
  const symbol = context.currencySymbol ?? "$";
  const m = (n: number) => `${n < 0 ? "-" : ""}${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const results: CheckResult[] = [];
  const configByCode = new Map(rules.map((r) => [r.code, r]));

  const add = (
    code: RuleCode,
    passed: boolean,
    values: { calculated?: number | null; expected?: number | null; difference?: number | null },
    message: string,
    action: string | null,
    details: string[] = [],
  ) => {
    const cfg = configByCode.get(code);
    if (!cfg || !cfg.isActive) return;
    const meta = RULE_CATALOGUE[code];
    results.push({
      ruleCode: code,
      name: ruleName(code, locale),
      status: statusFor(passed, cfg.severity),
      severity: cfg.severity,
      calculated: values.calculated ?? null,
      expected: values.expected ?? null,
      difference: values.difference ?? null,
      message,
      action: passed ? null : action,
      form: meta.form,
      field: meta.field,
      details,
      sortOrder: RULE_CODES.indexOf(code),
    });
  };
  const tol = (code: RuleCode) => configByCode.get(code)?.tolerance ?? 1;
  const param = (code: RuleCode, key: string, fallback: number) => {
    const value = configByCode.get(code)?.params?.[key];
    return typeof value === "number" ? value : fallback;
  };

  // Form A completeness
  {
    const a = data.formA;
    const fields: [string, string | null | undefined][] = [
      [L("Allocation number", "Lambarka qoondaynta"), a.allocationNumber],
      [L("Category", "Qaybta"), a.agencyCategory],
      [L("Accounting officer", "Mas'uulka xisaab-celinta"), a.accountingOfficer],
      [L("Contact person", "Qofka xidhiidhka"), a.contactPerson],
      [L("Telephone", "Telefoon"), a.telephone],
      [L("Email", "Iimayl"), a.email],
    ];
    const missing = fields.filter(([, v]) => !v || String(v).trim() === "").map(([k]) => k);
    add(
      "FORM_A_COMPLETE",
      missing.length === 0,
      {},
      missing.length === 0 ? L("All agency details provided", "Dhammaan faahfaahinta hay'adda waa la geliyey") : L(`Missing: ${missing.join(", ")}`, `Maqan: ${missing.join(", ")}`),
      L("Complete Form A", "Dhammaystir Foom A"),
      missing,
    );
  }

  // Budget not empty
  add(
    "BUDGET_NOT_EMPTY",
    summary.totals.expenditure > 0,
    { calculated: summary.totals.expenditure },
    summary.totals.expenditure > 0 ? L("Budget contains expenditure", "Miisaaniyaddu waxay leedahay kharash") : L("The proposed budget is zero", "Miisaaniyadda la soo jeediyey waa eber"),
    L("Enter recurrent expenditure in Form D", "Geli kharashaadka joogtada ah Foom D"),
  );

  // Non-negative amounts
  {
    const negatives: string[] = [];
    data.expenditureLines.forEach((l, i) => isNegative(l.amount) && negatives.push(L(`Expenditure line ${i + 1}`, `Safka kharashka ${i + 1}`)));
    data.revenueLines.forEach((l, i) => isNegative(l.amount) && negatives.push(L(`Revenue line ${i + 1}`, `Safka dakhliga ${i + 1}`)));
    data.personnel.forEach((p, i) => (isNegative(p.monthlyCost) || isNegative(p.filledPositions) || isNegative(p.approvedEstablishment)) && negatives.push(L(`Position ${i + 1}`, `Jagada ${i + 1}`)));
    data.capital.forEach((c) => (isNegative(c.allocation) || isNegative(c.totalCost)) && negatives.push(c.name));
    data.procurement.forEach((p) => isNegative(p.estimatedCost) && negatives.push(p.itemDescription));
    data.cashFlow.forEach((c) => isNegative(c.amount) && negatives.push(c.quarter));
    add(
      "NON_NEGATIVE_AMOUNTS",
      negatives.length === 0,
      {},
      negatives.length === 0 ? L("No negative amounts", "Ma jiraan tirooyin taban") : L(`${negatives.length} negative amount(s)`, `${negatives.length} tiro oo taban`),
      L("Correct negative amounts", "Sax tirooyinka taban"),
      negatives,
    );
  }

  // Check 1 — Personnel: Form D personnel = Form E total
  {
    const calculated = summary.formB.rows[0].proposed; // Form D personnel category (PERSONNEL group)
    const expected = summary.formE.totalAnnual;
    const difference = subtract(calculated, expected);
    const passed = withinTolerance(calculated, expected, tol("PERSONNEL_CONSISTENCY"));
    add(
      "PERSONNEL_CONSISTENCY",
      passed,
      { calculated, expected, difference },
      passed ? MESSAGES.pass[locale] : MESSAGES.mismatch[locale],
      L("Review Form D and Form E", "Dib u eeg Foom D iyo Foom E"),
    );
  }

  // Check 2 — Total: Form B total = recurrent (Form D) + capital (Form F)
  {
    const calculated = summary.formB.total.proposed;
    const expected = sum([summary.formD.total.proposed, summary.formF.totalAllocation]);
    const difference = subtract(calculated, expected);
    const passed = withinTolerance(calculated, expected, tol("TOTAL_BUDGET_CONSISTENCY"));
    add(
      "TOTAL_BUDGET_CONSISTENCY",
      passed,
      { calculated, expected, difference },
      passed ? MESSAGES.pass[locale] : MESSAGES.mismatch[locale],
      L("Review Form B, Form D and Form F", "Dib u eeg Foom B, Foom D iyo Foom F"),
    );
  }

  // Check 3 — Cash flow: Form H total = Form B total
  {
    const calculated = summary.formH.total;
    const expected = summary.formB.total.proposed;
    const difference = subtract(calculated, expected);
    const passed = withinTolerance(calculated, expected, tol("CASH_FLOW_CONSISTENCY"));
    add(
      "CASH_FLOW_CONSISTENCY",
      passed,
      { calculated, expected, difference },
      passed ? MESSAGES.pass[locale] : MESSAGES.mismatch[locale],
      L("Adjust the quarterly cash flow in Form H", "Hagaaji qulqulka lacagta Foom H"),
    );
  }

  // Cash flow in all quarters
  {
    const missing = summary.totals.expenditure > 0 ? summary.formH.rows.filter((r) => r.amount <= 0).map((r) => r.quarter) : [];
    add(
      "CASH_FLOW_ALL_QUARTERS",
      missing.length === 0,
      {},
      missing.length === 0 ? L("All quarters allocated", "Dhammaan saddex-biloodyada waa la qoondeeyey") : L(`${missing.join(", ")} cash-flow allocation is missing`, `Qoondaynta ${missing.join(", ")} way maqan tahay`),
      L("Enter the missing quarters in Form H", "Geli saddex-biloodyada maqan Foom H"),
      missing,
    );
  }

  // Check 4 — Procurement ≤ eligible budget
  {
    const calculated = summary.formG.total;
    const expected = summary.totals.procurementEligible;
    const difference = subtract(calculated, expected);
    const passed = calculated <= expected;
    add(
      "PROCUREMENT_LIMIT",
      passed,
      { calculated, expected, difference },
      passed ? MESSAGES.pass[locale] : MESSAGES.exceeds[locale],
      L("Reduce procurement items in Form G or review eligible budgets", "Yaree shayada iibsiga Foom G ama dib u eeg miisaaniyadaha"),
    );
  }

  // Procurement per category
  {
    const over: string[] = [];
    for (const row of summary.formD.rows) {
      const planned = summary.formG.byCategory[row.categoryId] ?? 0;
      if (planned > row.proposed + tol("PROCUREMENT_CATEGORY_LIMIT")) {
        over.push(`${locale === "so" ? row.labelSo : row.label}: ${m(planned)} > ${m(row.proposed)}`);
      }
    }
    const capitalPlanned = summary.formG.byCategory["CAPITAL"] ?? 0;
    if (capitalPlanned > summary.formF.totalAllocation + tol("PROCUREMENT_CATEGORY_LIMIT")) {
      over.push(`${L("Capital", "Raasamaal")}: ${m(capitalPlanned)} > ${m(summary.formF.totalAllocation)}`);
    }
    add(
      "PROCUREMENT_CATEGORY_LIMIT",
      over.length === 0,
      {},
      over.length === 0 ? L("Procurement within category budgets", "Iibsigu wuxuu ku jiraa xadka qaybaha") : L("Procurement exceeds allocation for some categories", "Iibsigu wuxuu dhaafay qoondaynta qaybaha qaarkood"),
      L("Review procurement categories in Form G", "Dib u eeg qaybaha iibsiga Foom G"),
      over,
    );
  }

  // Procurement items complete
  {
    const incomplete = data.procurement
      .filter((p) => !p.itemDescription?.trim() || toAmount(p.estimatedCost) <= 0 || !p.quarter || !p.procurementMethodId)
      .map((p, i) => p.itemDescription?.trim() || L(`Item ${i + 1}`, `Shay ${i + 1}`));
    add(
      "PROCUREMENT_ITEMS_COMPLETE",
      incomplete.length === 0,
      {},
      incomplete.length === 0 ? L("All procurement items complete", "Dhammaan shayada iibsiga waa dhammaystiran yihiin") : L(`${incomplete.length} incomplete procurement item(s)`, `${incomplete.length} shay oo aan dhammaystirnayn`),
      L("Complete procurement method, quarter and cost in Form G", "Dhammaystir habka, saddex-biloodka iyo kharashka Foom G"),
      incomplete,
    );
  }

  // Check 5 — Balanced budget: revenue = expenditure
  {
    const calculated = summary.totals.revenue;
    const expected = summary.totals.expenditure;
    const difference = subtract(calculated, expected);
    const passed = withinTolerance(calculated, expected, tol("BALANCED_BUDGET"));
    add(
      "BALANCED_BUDGET",
      passed,
      { calculated, expected, difference },
      passed ? MESSAGES.pass[locale] : MESSAGES.mismatch[locale],
      L("Review Form C revenue estimates against Form B expenditure", "Dib u eeg qiyaasaha dakhliga Foom C iyo kharashka Foom B"),
    );
  }

  // HR validation (Form E)
  {
    const over = data.personnel
      .filter((p) => toAmount(p.filledPositions) > toAmount(p.approvedEstablishment))
      .map((p) => `${p.positionTitle}: ${toAmount(p.filledPositions)} > ${toAmount(p.approvedEstablishment)}`);
    add(
      "PERSONNEL_ESTABLISHMENT",
      over.length === 0,
      {},
      over.length === 0 ? L("Filled positions within establishment", "Jagooyinka la buuxiyey way ku jiraan qaab-dhismeedka") : L(`${over.length} position(s) exceed the approved establishment`, `${over.length} jago ayaa dhaafay qaab-dhismeedka`),
      L("Review filled positions in Form E", "Dib u eeg jagooyinka la buuxiyey Foom E"),
      over,
    );

    const missingCost = data.personnel
      .filter((p) => toAmount(p.filledPositions) > 0 && toAmount(p.monthlyCost) <= 0)
      .map((p) => p.positionTitle || "—");
    add(
      "PERSONNEL_MONTHLY_COST",
      missingCost.length === 0,
      {},
      missingCost.length === 0 ? L("Monthly costs provided", "Kharashka bishii waa la geliyey") : L(`${missingCost.length} position(s) missing monthly cost`, `${missingCost.length} jago ayaa ka maqan kharashka bishii`),
      L("Enter the monthly cost in Form E", "Geli kharashka bishii Foom E"),
      missingCost,
    );

    const seen = new Map<string, number>();
    for (const p of data.personnel) {
      const key = `${p.positionTitle.trim().toLowerCase()}|${(p.grade ?? "").trim().toLowerCase()}`;
      if (!p.positionTitle.trim()) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k.split("|")[0]} ×${n}`);
    add(
      "PERSONNEL_DUPLICATES",
      duplicates.length === 0,
      {},
      duplicates.length === 0 ? L("No duplicate positions", "Ma jiraan jagooyin isku soo noqnoqday") : L(`${duplicates.length} duplicated position(s)`, `${duplicates.length} jago oo soo noqnoqotay`),
      L("Merge duplicate positions in Form E", "Isku dar jagooyinka soo noqnoqday Foom E"),
      duplicates,
    );

    const wrongAnnual = data.personnel
      .filter((p) => p.annualCost !== undefined && p.annualCost !== null && !withinTolerance(p.annualCost, calculatePersonnelCost(p.filledPositions, p.monthlyCost), tol("PERSONNEL_ANNUAL_CALCULATION")))
      .map((p) => `${p.positionTitle}: ${m(toAmount(p.annualCost))} ≠ ${m(calculatePersonnelCost(p.filledPositions, p.monthlyCost))}`);
    add(
      "PERSONNEL_ANNUAL_CALCULATION",
      wrongAnnual.length === 0,
      {},
      wrongAnnual.length === 0 ? L("Annual costs correctly calculated", "Kharashka sannadka si sax ah ayaa loo xisaabiyey") : L(`${wrongAnnual.length} invalid annual calculation(s)`, `${wrongAnnual.length} xisaab sannadeed oo khaldan`),
      L("Recalculate annual costs in Form E", "Dib u xisaabi kharashka sannadka Foom E"),
      wrongAnnual,
    );
  }

  // Capital projects (Form F)
  {
    const over = data.capital
      .filter((c) => sum([c.spentToDate, c.allocation]) > toAmount(c.totalCost) + tol("CAPITAL_ALLOCATION_WITHIN_COST"))
      .map((c) => c.name);
    add(
      "CAPITAL_ALLOCATION_WITHIN_COST",
      over.length === 0,
      {},
      over.length === 0 ? L("Allocations within project costs", "Qoondaynta waxay ku jirtaa kharashka mashaariicda") : L(`${over.length} project(s) exceed total cost`, `${over.length} mashruuc ayaa dhaafay kharashka guud`),
      L("Review allocations in Form F", "Dib u eeg qoondaynta Foom F"),
      over,
    );

    const incomplete = data.capital.filter((c) => !c.fundingSourceId || !c.expectedCompletionDate || !c.justification?.trim()).map((c) => c.name);
    add(
      "CAPITAL_PROJECT_DETAILS",
      incomplete.length === 0,
      {},
      incomplete.length === 0 ? L("Project details complete", "Faahfaahinta mashaariicda waa dhammaystiran tahay") : L(`${incomplete.length} project(s) missing funding source, completion date or justification`, `${incomplete.length} mashruuc ayaa ka maqan isha maalgelinta, taariikhda ama sababaynta`),
      L("Complete project details in Form F", "Dhammaystir faahfaahinta mashaariicda Foom F"),
      incomplete,
    );
  }

  // Justifications for large changes (Form D) and explanations (Form C)
  {
    const threshold = param("CHANGE_JUSTIFICATION", "thresholdPercent", 20);
    const unjustified = summary.formD.rows
      .filter((r) => r.changePercent !== null && Math.abs(r.changePercent) > threshold && !data.notes[`D:${r.categoryId}`]?.trim())
      .map((r) => `${locale === "so" ? r.labelSo : r.label} (${r.changePercent!.toFixed(1)}%)`);
    const newWithoutBaseline = summary.formD.rows
      .filter((r) => r.approved === 0 && r.proposed > 0 && !data.notes[`D:${r.categoryId}`]?.trim())
      .map((r) => `${locale === "so" ? r.labelSo : r.label} (${L("new", "cusub")})`);
    const all = [...unjustified, ...newWithoutBaseline];
    add(
      "CHANGE_JUSTIFICATION",
      all.length === 0,
      {},
      all.length === 0 ? L("Large changes are justified", "Isbeddelada waaweyn waa la sababeeyey") : L(`${all.length} category change(s) above ${threshold}% need justification`, `${all.length} isbeddel oo ka badan ${threshold}% ayaa u baahan sababayn`),
      L("Add justifications in Form D", "Ku dar sababaynta Foom D"),
      all,
    );

    const revThreshold = param("REVENUE_EXPLANATION", "thresholdPercent", 20);
    const unexplained = summary.formC.rows
      .filter((r) => r.changePercent !== null && Math.abs(r.changePercent) > revThreshold && !data.notes[`C:${r.categoryId}`]?.trim())
      .map((r) => `${locale === "so" ? r.labelSo : r.label} (${r.changePercent!.toFixed(1)}%)`);
    add(
      "REVENUE_EXPLANATION",
      unexplained.length === 0,
      {},
      unexplained.length === 0 ? L("Revenue changes explained", "Isbeddelada dakhliga waa la sharaxay") : L(`${unexplained.length} revenue change(s) need an explanation`, `${unexplained.length} isbeddel dakhli ayaa u baahan sharaxaad`),
      L("Add explanations in Form C", "Ku dar sharaxaadda Foom C"),
      unexplained,
    );
  }

  // Cash flow vs procurement timing
  {
    const short = QUARTERS.filter((q) => {
      const cash = summary.formH.rows.find((r) => r.quarter === q)?.amount ?? 0;
      return summary.formG.byQuarter[q] > cash + tol("CASH_FLOW_PROCUREMENT_TIMING");
    });
    add(
      "CASH_FLOW_PROCUREMENT_TIMING",
      short.length === 0,
      {},
      short.length === 0 ? L("Cash flow covers planned procurement", "Qulqulka lacagta wuxuu daboolayaa iibsiga") : L(`Procurement exceeds cash flow in ${short.join(", ")}`, `Iibsigu wuxuu dhaafay qulqulka lacagta ${short.join(", ")}`),
      L("Align Form G quarters with Form H", "Isku waafaji saddex-biloodyada Foom G iyo Foom H"),
      short.map((q) => `${q}: ${m(summary.formG.byQuarter[q])} > ${m(summary.formH.rows.find((r) => r.quarter === q)?.amount ?? 0)}`),
    );
  }

  // Certification
  add(
    "CERTIFICATION_PREPARED",
    Boolean(context.certificationPrepared),
    {},
    context.certificationPrepared ? L("Prepared-by certification signed", "Caddaynta diyaariyaha waa la saxiixay") : L("Will be signed automatically on submission", "Si toos ah ayaa loo saxiixi doonaa marka la gudbiyo"),
    L("Sign the certification", "Saxiix caddaynta"),
  );

  return results.sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface ValidationTally {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
  blocking: CheckResult[];
}

export function tallyResults(results: CheckResult[]): ValidationTally {
  const errors = results.filter((r) => r.status === "ERROR");
  return {
    passed: results.filter((r) => r.status === "PASS").length,
    warnings: results.filter((r) => r.status === "WARNING").length,
    errors: errors.length,
    total: results.length,
    blocking: errors,
  };
}

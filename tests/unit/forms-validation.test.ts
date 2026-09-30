import { describe, expect, it } from "vitest";
import { computeFormCompletion, computeSubmissionSummary, defaultRuleConfigs, tallyResults, validateBudgetConsistency, type RuleConfig } from "@/lib/calculations";
import { consistentSubmission } from "../support/fixtures";

describe("form summaries", () => {
  it("derives Form B from Forms D and F", () => {
    const summary = computeSubmissionSummary(consistentSubmission());
    const [personnel, goods, capital, other] = summary.formB.rows;
    expect(personnel.proposed).toBe(120_000);
    expect(personnel.approved).toBe(110_000);
    expect(personnel.change).toBe(10_000);
    expect(personnel.changePercent).toBeCloseTo(9.0909, 3);
    expect(goods.proposed).toBe(30_000);
    expect(capital.proposed).toBe(50_000);
    expect(capital.approved).toBe(40_000);
    expect(other.proposed).toBe(20_000); // basic + travel + O&M + other recurrent
    expect(summary.formB.total.proposed).toBe(220_000);
    expect(summary.formD.total.proposed).toBe(170_000);
  });

  it("computes Form C, E, G and H", () => {
    const summary = computeSubmissionSummary(consistentSubmission());
    expect(summary.formC.total.estimate).toBe(220_000);
    expect(summary.formC.total.priorYearActual).toBe(168_000);
    expect(summary.formE.totalAnnual).toBe(120_000); // (1×2000 + 8×1000) × 12
    expect(summary.formE.totalEstablishment).toBe(11);
    expect(summary.formG.total).toBe(65_000);
    expect(summary.formG.byQuarter.Q2).toBe(45_000);
    expect(summary.formH.total).toBe(220_000);
    expect(summary.formH.rows[0].percentOfBudget).toBe(25);
    // Procurement-eligible = goods & services + basic services + capital
    expect(summary.totals.procurementEligible).toBe(90_000);
  });

  it("reports completion per form", () => {
    const data = consistentSubmission();
    const completion = computeFormCompletion(data, computeSubmissionSummary(data));
    expect(completion.A).toBe(100);
    expect(completion.H).toBe(100);
    expect(completion.E).toBe(100);
  });
});

describe("validation center", () => {
  it("passes every consistency check for a consistent budget", () => {
    const data = consistentSubmission();
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data), defaultRuleConfigs(), { certificationPrepared: true });
    const tally = tallyResults(results);
    expect(tally.errors).toBe(0);
    expect(results.find((r) => r.ruleCode === "PERSONNEL_CONSISTENCY")).toMatchObject({ status: "PASS", calculated: 120_000, expected: 120_000, difference: 0 });
    expect(results.find((r) => r.ruleCode === "TOTAL_BUDGET_CONSISTENCY")?.status).toBe("PASS");
    expect(results.find((r) => r.ruleCode === "CASH_FLOW_CONSISTENCY")?.status).toBe("PASS");
    expect(results.find((r) => r.ruleCode === "PROCUREMENT_LIMIT")?.status).toBe("PASS");
    expect(results.find((r) => r.ruleCode === "BALANCED_BUDGET")?.status).toBe("PASS");
  });

  it("flags a personnel mismatch as an ERROR with the difference", () => {
    const data = consistentSubmission();
    data.personnel[1].filledPositions = 10; // Form E now 144,000 vs Form D 120,000
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    const check = results.find((r) => r.ruleCode === "PERSONNEL_CONSISTENCY")!;
    expect(check.status).toBe("ERROR");
    expect(check.calculated).toBe(120_000);
    expect(check.expected).toBe(144_000);
    expect(check.difference).toBe(-24_000);
    expect(check.action).toMatch(/Form D and Form E/);
  });

  it("flags missing quarters and cash-flow mismatch", () => {
    const data = consistentSubmission();
    data.cashFlow = data.cashFlow.filter((c) => c.quarter !== "Q4");
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    expect(results.find((r) => r.ruleCode === "CASH_FLOW_CONSISTENCY")).toMatchObject({ status: "ERROR", difference: -55_000 });
    expect(results.find((r) => r.ruleCode === "CASH_FLOW_ALL_QUARTERS")?.message).toMatch(/Q4 cash-flow allocation is missing/);
  });

  it("flags procurement above the eligible budget", () => {
    const data = consistentSubmission();
    data.procurement.push({ itemDescription: "Vehicles", estimatedCost: 50_000, quarter: "Q3", procurementMethodId: "open", budgetCategoryId: "c-gs" });
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    expect(results.find((r) => r.ruleCode === "PROCUREMENT_LIMIT")).toMatchObject({ status: "ERROR", calculated: 115_000, expected: 90_000, difference: 25_000 });
    expect(results.find((r) => r.ruleCode === "PROCUREMENT_CATEGORY_LIMIT")?.status).toBe("WARNING");
  });

  it("performs HR validation (establishment, missing cost, duplicates)", () => {
    const data = consistentSubmission();
    data.personnel.push({ positionTitle: "Officer", grade: "B", approvedEstablishment: 2, filledPositions: 3, monthlyCost: 0 });
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    expect(results.find((r) => r.ruleCode === "PERSONNEL_ESTABLISHMENT")?.status).toBe("WARNING");
    expect(results.find((r) => r.ruleCode === "PERSONNEL_MONTHLY_COST")?.status).toBe("WARNING");
    expect(results.find((r) => r.ruleCode === "PERSONNEL_DUPLICATES")?.status).toBe("WARNING");
  });

  it("detects an invalid stored annual calculation", () => {
    const data = consistentSubmission();
    data.personnel[0].annualCost = 25_000;
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    expect(results.find((r) => r.ruleCode === "PERSONNEL_ANNUAL_CALCULATION")?.status).toBe("ERROR");
  });

  it("honours configured severity (balanced budget as ERROR) and disabled rules", () => {
    const data = consistentSubmission();
    data.revenueLines = [];
    const rules: RuleConfig[] = defaultRuleConfigs().map((r) =>
      r.code === "BALANCED_BUDGET" ? { ...r, severity: "ERROR" } : r.code === "REVENUE_EXPLANATION" ? { ...r, isActive: false } : r,
    );
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data), rules);
    expect(results.find((r) => r.ruleCode === "BALANCED_BUDGET")?.status).toBe("ERROR");
    expect(results.find((r) => r.ruleCode === "REVENUE_EXPLANATION")).toBeUndefined();
  });

  it("requires justification for large category changes", () => {
    const data = consistentSubmission();
    data.expenditureLines[4].amount = 8_000; // O&M +100% without justification
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data));
    const check = results.find((r) => r.ruleCode === "CHANGE_JUSTIFICATION")!;
    expect(check.status).toBe("WARNING");
    expect(check.details.join(" ")).toMatch(/Operations and Maintenance/);
  });

  it("localises messages in Somali", () => {
    const data = consistentSubmission();
    data.personnel[1].filledPositions = 10;
    const results = validateBudgetConsistency(data, computeSubmissionSummary(data), defaultRuleConfigs(), { locale: "so" });
    expect(results.find((r) => r.ruleCode === "PERSONNEL_CONSISTENCY")?.message).toBe("KALA DUWAN - dib u eeg");
  });
});

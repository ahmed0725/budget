import { describe, expect, it } from "vitest";
import {
  calculateAvailableBalance,
  calculateBudgetTotal,
  calculateCagr,
  calculateChange,
  calculateExecutionRate,
  calculateGrowthRate,
  calculateMonthlyAmount,
  calculatePersonnelCost,
  calculateRevenueCollectionRate,
  calculateVariance,
  monthsOfQuarter,
  parseAmount,
  quarterOfMonth,
  spreadAcrossQuarters,
  spreadAnnualAmount,
  sum,
  withinTolerance,
} from "@/lib/calculations";

describe("money helpers", () => {
  it("sums without floating point drift", () => {
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(sum(["1,250,000.10", 0.2, null, undefined, ""])).toBe(1250000.3);
  });

  it("parses spreadsheet and user amounts", () => {
    expect(parseAmount("$1,250,000.00")).toEqual({ ok: true, value: 1250000 });
    expect(parseAmount("US$ 45,000")).toEqual({ ok: true, value: 45000 });
    expect(parseAmount("(2,500)")).toEqual({ ok: true, value: -2500 });
    expect(parseAmount("")).toEqual({ ok: true, value: null });
    expect(parseAmount(12.345)).toEqual({ ok: true, value: 12.35 });
    expect(parseAmount("12abc").ok).toBe(false);
    expect(parseAmount("#REF!").ok).toBe(false);
  });

  it("checks tolerance like the official template (|difference| < 1)", () => {
    expect(withinTolerance(100, 100.99)).toBe(true);
    expect(withinTolerance(100, 101)).toBe(false);
  });
});

describe("budget formulas", () => {
  it("calculates totals", () => {
    expect(calculateBudgetTotal([1000, 2500.5, "499.5"])).toBe(4000);
  });

  it("calculates change and change % (Form B/D)", () => {
    expect(calculateChange(1_200_000, 1_000_000)).toEqual({ amount: 200_000, percent: 20 });
    expect(calculateChange(1_800_000, 2_000_000)).toEqual({ amount: -200_000, percent: -10 });
  });

  it("handles zero baselines safely", () => {
    expect(calculateChange(500, 0)).toEqual({ amount: 500, percent: null });
    expect(calculateGrowthRate(10, 0)).toBeNull();
    expect(calculateExecutionRate(10, 0)).toBeNull();
  });

  it("calculates variance, execution and collection rates", () => {
    expect(calculateVariance(1000, 750)).toEqual({ amount: 250, percent: 25 });
    expect(calculateExecutionRate(750, 1000)).toBe(75);
    expect(calculateRevenueCollectionRate(900, 1200)).toBe(75);
    expect(calculateAvailableBalance(1000, 600, 150)).toBe(250);
  });

  it("calculates growth and CAGR", () => {
    expect(calculateGrowthRate(110, 100)).toBe(10);
    expect(calculateCagr(100, 121, 2)).toBeCloseTo(10, 4);
    expect(calculateCagr(0, 121, 2)).toBeNull();
  });

  it("calculates personnel annual cost (filled × monthly × 12)", () => {
    expect(calculatePersonnelCost(10, 500)).toBe(60_000);
    expect(calculatePersonnelCost(3, "1,250.50")).toBe(45_018);
  });

  it("derives monthly amounts (annual / 12)", () => {
    expect(calculateMonthlyAmount(1200)).toBe(100);
    expect(calculateMonthlyAmount(1000)).toBe(83.33);
  });

  it("spreads annual amounts so months add up exactly", () => {
    const months = spreadAnnualAmount(1000);
    expect(months).toHaveLength(12);
    expect(sum(months)).toBe(1000);
    const quarters = spreadAcrossQuarters(1000);
    expect(sum(Object.values(quarters))).toBe(1000);
  });

  it("maps months and quarters", () => {
    expect(quarterOfMonth(1)).toBe("Q1");
    expect(quarterOfMonth(6)).toBe("Q2");
    expect(quarterOfMonth(12)).toBe("Q4");
    expect(monthsOfQuarter("Q3")).toEqual([7, 8, 9]);
    expect(() => quarterOfMonth(13)).toThrow();
  });
});

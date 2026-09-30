/**
 * Central budget calculation engine.
 *
 * Every financial formula used in the system lives here (or in forms.ts, which
 * composes these). React components may call these for live previews, but the
 * server always recomputes and stores the authoritative values.
 */
import { Decimal, type Numeric, sum, toAmount, toDecimal, toRatio } from "./money";

export type QuarterKey = "Q1" | "Q2" | "Q3" | "Q4";
export const QUARTERS: readonly QuarterKey[] = ["Q1", "Q2", "Q3", "Q4"] as const;
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface ChangeResult {
  /** proposed − baseline */
  amount: number;
  /** (proposed − baseline) / baseline × 100, or null when the baseline is zero */
  percent: number | null;
}

export interface VarianceResult {
  /** budget − actual (positive = under-spent / remaining) */
  amount: number;
  /** variance / budget × 100, or null when the budget is zero */
  percent: number | null;
}

/** Sum of a list of amounts. */
export function calculateBudgetTotal(amounts: readonly Numeric[]): number {
  return sum(amounts);
}

/** Percentage `part / whole × 100`; null when `whole` is zero (division guarded). */
export function calculatePercent(part: Numeric, whole: Numeric): number | null {
  const w = toDecimal(whole);
  if (w.isZero()) return null;
  return toRatio(toDecimal(part).div(w).times(100));
}

/**
 * Year-on-year change as used by Forms B and D:
 *   Change   = Proposal − Approved
 *   Change % = Change / Approved × 100   (blank when Approved is zero)
 */
export function calculateChange(proposed: Numeric, baseline: Numeric): ChangeResult {
  const change = toDecimal(proposed).minus(toDecimal(baseline));
  return { amount: toAmount(change), percent: calculatePercent(change, baseline) };
}

/**
 * Budget variance:
 *   Variance   = Approved/Revised budget − Actual
 *   Variance % = Variance / Budget × 100
 */
export function calculateVariance(budget: Numeric, actual: Numeric): VarianceResult {
  const variance = toDecimal(budget).minus(toDecimal(actual));
  return { amount: toAmount(variance), percent: calculatePercent(variance, budget) };
}

/** Growth rate = (Current − Previous) / Previous × 100 */
export function calculateGrowthRate(current: Numeric, previous: Numeric): number | null {
  return calculateChange(current, previous).percent;
}

/** Compound annual growth rate over `periods` years, as a percentage. */
export function calculateCagr(first: Numeric, last: Numeric, periods: number): number | null {
  const f = toDecimal(first);
  const l = toDecimal(last);
  if (periods <= 0 || f.lte(0) || l.lt(0)) return null;
  const ratio = l.div(f).toNumber();
  return toRatio(new Decimal(Math.pow(ratio, 1 / periods) - 1).times(100));
}

/** Execution rate = Actual / Approved budget × 100 */
export function calculateExecutionRate(actual: Numeric, budget: Numeric): number | null {
  return calculatePercent(actual, budget);
}

/** Collection rate = Actual revenue / Revenue target × 100 */
export function calculateRevenueCollectionRate(actual: Numeric, target: Numeric): number | null {
  return calculatePercent(actual, target);
}

/** Available budget = Budget − Actual − Outstanding commitments */
export function calculateAvailableBalance(budget: Numeric, actual: Numeric, committed: Numeric = 0): number {
  return toAmount(toDecimal(budget).minus(toDecimal(actual)).minus(toDecimal(committed)));
}

/** Annual personnel cost = Filled positions × Monthly cost × 12 */
export function calculatePersonnelCost(filledPositions: Numeric, monthlyCost: Numeric): number {
  return toAmount(toDecimal(filledPositions).times(toDecimal(monthlyCost)).times(12));
}

/** Monthly estimate = Annual amount / 12 (as in the source workbooks' "Qiyaas Bileed" column). */
export function calculateMonthlyAmount(annual: Numeric): number {
  return toAmount(toDecimal(annual).div(12));
}

/** Share of a total, e.g. quarter amount / total budget × 100. */
export function calculateShare(part: Numeric, total: Numeric): number | null {
  return calculatePercent(part, total);
}

export function quarterOfMonth(month: number): QuarterKey {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month ${month}`);
  return QUARTERS[Math.floor((month - 1) / 3)];
}

export function monthsOfQuarter(quarter: QuarterKey): number[] {
  const index = QUARTERS.indexOf(quarter);
  return [index * 3 + 1, index * 3 + 2, index * 3 + 3];
}

/**
 * Spread an annual amount across 12 months so the months add up exactly to the
 * annual total (the rounding remainder goes to December).
 */
export function spreadAnnualAmount(annual: Numeric, weights?: readonly number[]): number[] {
  const total = toDecimal(annual);
  const w = weights && weights.length === 12 ? weights : new Array(12).fill(1);
  const weightSum = w.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return new Array(12).fill(0);
  const months = w.map((x) => total.times(x).div(weightSum).toDecimalPlaces(2, Decimal.ROUND_DOWN));
  const allocated = months.reduce((acc, m) => acc.plus(m), new Decimal(0));
  months[11] = months[11].plus(total.minus(allocated));
  return months.map((m) => m.toDecimalPlaces(2).toNumber());
}

/** Spread an annual amount across four quarters (remainder to Q4). */
export function spreadAcrossQuarters(annual: Numeric): Record<QuarterKey, number> {
  const months = spreadAnnualAmount(annual);
  return {
    Q1: sum(months.slice(0, 3)),
    Q2: sum(months.slice(3, 6)),
    Q3: sum(months.slice(6, 9)),
    Q4: sum(months.slice(9, 12)),
  };
}

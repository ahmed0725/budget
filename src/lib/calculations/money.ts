/**
 * Decimal-safe arithmetic helpers used by every budget calculation.
 *
 * Amounts are stored as numeric(18,2). All arithmetic is performed with decimal.js
 * and rounded half-up to 2 decimal places, so server and client produce identical
 * results and floating-point drift never reaches totals.
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/** Anything that can be interpreted as an amount (Prisma Decimal, string, number). */
export type Numeric = number | string | Decimal | { toString(): string } | null | undefined;

export function toDecimal(value: Numeric): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (Decimal.isDecimal(value)) return value as Decimal;
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Decimal(value) : new Decimal(0);
  }
  const text = String(value).trim().replace(/,/g, "");
  if (text === "" || text === "-") return new Decimal(0);
  try {
    const d = new Decimal(text);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Round to cents and return a JS number (safe for amounts below 10^13). */
export function toAmount(value: Numeric): number {
  return toDecimal(value).toDecimalPlaces(2).toNumber();
}

/** Round a ratio/percentage to 4 decimal places. */
export function toRatio(value: Decimal): number {
  return value.toDecimalPlaces(4).toNumber();
}

export function sum(values: readonly Numeric[]): number {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0)).toDecimalPlaces(2).toNumber();
}

export function sumBy<T>(items: readonly T[], pick: (item: T) => Numeric): number {
  return sum(items.map(pick));
}

export function subtract(a: Numeric, b: Numeric): number {
  return toDecimal(a).minus(toDecimal(b)).toDecimalPlaces(2).toNumber();
}

export function multiply(...values: Numeric[]): number {
  return values.reduce<Decimal>((acc, v) => acc.times(toDecimal(v)), new Decimal(1)).toDecimalPlaces(2).toNumber();
}

export function isZero(value: Numeric): boolean {
  return toDecimal(value).isZero();
}

export function isNegative(value: Numeric): boolean {
  return toDecimal(value).isNegative() && !toDecimal(value).isZero();
}

/** |a - b| < tolerance — used by the consistency checks (template uses < 1). */
export function withinTolerance(a: Numeric, b: Numeric, tolerance: Numeric = 1): boolean {
  return toDecimal(a).minus(toDecimal(b)).abs().lessThan(toDecimal(tolerance));
}

/**
 * Parse user or spreadsheet input into an amount. Unlike `toDecimal`, invalid input is
 * reported instead of silently becoming zero.
 */
export function parseAmount(input: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, error: "Not a finite number" };
    return { ok: true, value: toAmount(input) };
  }
  let text = String(input).trim();
  if (text === "" || text === "-") return { ok: true, value: null };
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/^(US\$|USD)\s*/i, "").replace(/[$€£\s]/g, "").replace(/,/g, "");
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(text)) {
    return { ok: false, error: `"${String(input)}" is not a valid amount` };
  }
  const d = new Decimal(text);
  return { ok: true, value: (negative ? d.negated() : d).toDecimalPlaces(2).toNumber() };
}

export { Decimal };

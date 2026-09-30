import { Decimal } from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import { changedFields, jsonSafe } from "@/lib/services/audit";

// The audit helpers are pure; keep the database client out of unit tests (vi.mock is hoisted).
vi.mock("@/lib/db", () => ({ prisma: {} }));

type Row = Record<string, unknown>;

describe("changedFields", () => {
  it("reports only the fields that changed", () => {
    const before: Row = { name: "Office supplies", amount: new Decimal("1500.00"), notes: null };
    expect(changedFields<Row>(before, { name: "Office supplies", amount: 1500, notes: "" })).toBeNull();
    expect(changedFields<Row>(before, { name: "Stationery", amount: 1500 })).toEqual({ oldValue: { name: "Office supplies" }, newValue: { name: "Stationery" } });
  });

  it("compares amounts numerically across Decimal, number and string", () => {
    expect(changedFields<Row>({ amount: new Decimal("2500.5") }, { amount: "2500.50" })).toBeNull();
    expect(changedFields<Row>({ amount: new Decimal("2500.5") }, { amount: 2600 })?.newValue).toEqual({ amount: 2600 });
  });

  it("compares dates by instant", () => {
    const d = new Date("2027-01-01T00:00:00Z");
    expect(changedFields<Row>({ at: d }, { at: new Date(d.getTime()) })).toBeNull();
    expect(changedFields<Row>({ at: d }, { at: new Date("2027-01-02T00:00:00Z") })).not.toBeNull();
  });
});

describe("jsonSafe", () => {
  it("serialises Decimals, BigInts and nested values", () => {
    expect(jsonSafe({ a: new Decimal("1.10"), b: BigInt(42), c: [new Decimal("2")] })).toEqual({ a: "1.1", b: "42", c: ["2"] });
    expect(jsonSafe(undefined)).toBeUndefined();
  });
});

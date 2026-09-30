import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError, BusinessRuleError } from "@/lib/errors";
import { changeCommitmentStatus, commitmentBalance, createCommitment, executionLines, recordActual } from "@/lib/services/execution";
import { actorFor, mdaId } from "../support/db";

let admin: Actor;
let mda: string;
let codeId: string;

beforeAll(async () => {
  admin = await actorFor("admin");
  mda = await mdaId("10101");
  codeId = (await prisma.budgetCode.findFirstOrThrow({ where: { kind: "EXPENDITURE", code: "2224" } })).id;
});

describe("commitments", () => {
  it("blocks commitments above the available balance and explains why", async () => {
    const bal = await commitmentBalance(admin, 2026, mda, codeId);
    expect(bal.hasAllocation).toBe(true);
    await expect(
      createCommitment(admin, { year: 2026, mdaId: mda, codeId, reference: "TEST-OVER", description: "Too large", supplier: null, amount: bal.available + 1, commitmentDate: "2026-09-01" }),
    ).rejects.toThrow(/exceeds the available balance/);
  });

  it("reserves budget, then records the payment as actual expenditure", async () => {
    const before = await commitmentBalance(admin, 2026, mda, codeId);
    const c = await createCommitment(admin, { year: 2026, mdaId: mda, codeId, reference: "TEST-0001", description: "Printer cartridges", supplier: "Horn Stationery", amount: 100, commitmentDate: "2026-09-01" });
    const reserved = await commitmentBalance(admin, 2026, mda, codeId);
    expect(reserved.available).toBeCloseTo(before.available - 100, 2);
    await expect(createCommitment(admin, { year: 2026, mdaId: mda, codeId, reference: "TEST-0001", description: "Duplicate reference", supplier: null, amount: 1, commitmentDate: "2026-09-01" })).rejects.toThrow(/already used/);

    await changeCommitmentStatus(admin, c.id, "OBLIGATE", null);
    await changeCommitmentStatus(admin, c.id, "PAY", null);
    const paid = await commitmentBalance(admin, 2026, mda, codeId);
    expect(paid.committed).toBeCloseTo(before.committed, 2);
    expect(paid.actual).toBeCloseTo(before.actual + 100, 2);
    expect(paid.available).toBeCloseTo(before.available - 100, 2);
    await expect(changeCommitmentStatus(admin, c.id, "CANCEL", "late")).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("requires a reason to cancel", async () => {
    const c = await createCommitment(admin, { year: 2026, mdaId: mda, codeId, reference: "TEST-0002", description: "Cancelled order", supplier: null, amount: 10, commitmentDate: "2026-09-02" });
    await expect(changeCommitmentStatus(admin, c.id, "CANCEL", null)).rejects.toThrow(/reason/);
    await changeCommitmentStatus(admin, c.id, "CANCEL", "Supplier could not deliver");
    expect((await prisma.commitment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
  });
});

describe("actuals", () => {
  it("records monthly actuals and rejects closed years", async () => {
    await recordActual(admin, { year: 2026, kind: "EXPENDITURE", mdaId: mda, codeId, month: 10, actual: 321.5, planned: null, remarks: "October" });
    const line = (await executionLines(admin, { year: 2026, kind: "EXPENDITURE", mdaId: mda })).find((l) => l.codeId === codeId)!;
    expect(line.months[9]).toBe(321.5);
    await expect(recordActual(admin, { year: 2025, kind: "EXPENDITURE", mdaId: mda, codeId, month: 1, actual: 1, planned: null, remarks: null })).rejects.toThrow(/closed/);
  });

  it("limits agency users to their own MDA", async () => {
    const officer = await actorFor("officer.40101");
    await expect(executionLines(officer, { year: 2026, kind: "EXPENDITURE", mdaId: mda })).rejects.toBeInstanceOf(AuthorizationError);
    const own = await executionLines(officer, { year: 2026, kind: "EXPENDITURE" });
    expect(own.length).toBeGreaterThan(0);
    expect(new Set(own.map((l) => l.mdaCode))).toEqual(new Set(["40101"]));
  });
});

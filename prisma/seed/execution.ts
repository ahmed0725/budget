/**
 * DEVELOPMENT SEED DATA — budget execution records (source = DEV_SEED).
 *
 * Monthly planned vs actual expenditure, revenue targets vs collections and a
 * commitments register, generated deterministically from the published budgets
 * (execution baselines). 2024 and 2025 are complete years; 2026 is executed up to
 * the last closed month.
 */
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { spreadAnnualAmount, toAmount } from "../../src/lib/calculations";
import { createRng, round } from "./rng";

const SEASONAL = [0.8, 0.9, 1.0, 1.0, 1.05, 1.1, 0.95, 0.95, 1.0, 1.0, 1.05, 1.2];

export async function seedExecution(prisma: PrismaClient, today = new Date()) {
  const rng = createRng(4242);
  const years = await prisma.budgetYear.findMany({ where: { year: { in: [2024, 2025, 2026] } } });
  let expRows = 0;
  let revRows = 0;
  for (const y of years) {
    const lastClosedMonth = y.year < today.getUTCFullYear() ? 12 : y.year === today.getUTCFullYear() ? today.getUTCMonth() : 0;
    const allocations = await prisma.budgetAllocation.findMany({ where: { budgetYearId: y.id } });
    // Execution performance differs per MDA (some agencies spend faster than others).
    const mdaFactor = new Map<string, number>();
    const expenditure: Prisma.ExpenditureExecutionCreateManyInput[] = [];
    const revenue: Prisma.RevenueExecutionCreateManyInput[] = [];
    // Aggregate project allocations by code (execution is recorded per code).
    const byCode = new Map<string, { mdaId: string; budgetCodeId: string; kind: string; amount: number }>();
    for (const a of allocations) {
      const key = `${a.kind}|${a.mdaId}|${a.budgetCodeId}`;
      const cur = byCode.get(key);
      byCode.set(key, { mdaId: a.mdaId, budgetCodeId: a.budgetCodeId, kind: a.kind, amount: toAmount((cur?.amount ?? 0) + Number(a.revisedAmount)) });
    }
    for (const a of byCode.values()) {
      if (a.amount <= 0) continue;
      if (!mdaFactor.has(a.mdaId)) mdaFactor.set(a.mdaId, rng.between(0.72, 1.02));
      const planned = spreadAnnualAmount(a.amount, SEASONAL);
      for (let m = 1; m <= 12; m++) {
        const executed = m <= lastClosedMonth;
        const factor = (mdaFactor.get(a.mdaId) ?? 0.9) * rng.between(0.85, 1.1);
        const actual = executed ? round(planned[m - 1] * factor, 1) : 0;
        if (a.kind === "EXPENDITURE") {
          expenditure.push({ budgetYearId: y.id, mdaId: a.mdaId, budgetCodeId: a.budgetCodeId, month: m, plannedAmount: planned[m - 1], actualAmount: actual, source: "DEV_SEED" });
        } else {
          revenue.push({ budgetYearId: y.id, mdaId: a.mdaId, budgetCodeId: a.budgetCodeId, month: m, targetAmount: planned[m - 1], actualAmount: executed ? round(planned[m - 1] * rng.between(0.7, 1.08), 1) : 0, source: "DEV_SEED" });
        }
      }
    }
    for (let i = 0; i < expenditure.length; i += 1000) await prisma.expenditureExecution.createMany({ data: expenditure.slice(i, i + 1000), skipDuplicates: true });
    for (let i = 0; i < revenue.length; i += 1000) await prisma.revenueExecution.createMany({ data: revenue.slice(i, i + 1000), skipDuplicates: true });
    expRows += expenditure.length;
    revRows += revenue.length;
  }

  // Commitments register for the current execution year.
  const current = years.find((y) => y.year === today.getUTCFullYear());
  let commitments = 0;
  if (current) {
    const candidates = await prisma.budgetAllocation.findMany({
      where: { budgetYearId: current.id, kind: "EXPENDITURE", budgetCode: { code: { in: ["2224", "2225", "2231", "2223", "2221", "2211"] } } },
      include: { budgetCode: true, mda: true },
    });
    const suppliers = ["Laascaanood Trading Co.", "Sool General Supplies", "Nugaal Motors", "Cayn Construction Ltd", "Horn Stationery", "Waqooyi Bari Fuel Station"];
    const statuses = ["COMMITTED", "OBLIGATED", "LIQUIDATED", "LIQUIDATED", "CANCELLED"] as const;
    for (const [i, a] of candidates.slice(0, 60).entries()) {
      const amount = round(Number(a.revisedAmount) * rng.between(0.05, 0.18), 10);
      if (amount <= 0) continue;
      const status = statuses[i % statuses.length];
      const month = rng.int(1, Math.max(1, today.getUTCMonth()));
      const date = new Date(Date.UTC(current.year, month - 1, rng.int(1, 27)));
      await prisma.commitment.create({
        data: {
          budgetYearId: current.id,
          mdaId: a.mdaId,
          budgetCodeId: a.budgetCodeId,
          reference: `PO-${current.year}-${String(i + 1).padStart(4, "0")}`,
          description: `${a.budgetCode.nameEn ?? a.budgetCode.name} — ${a.mda.code}`,
          supplier: rng.pick(suppliers),
          amount,
          commitmentDate: date,
          status,
          obligatedAt: status !== "COMMITTED" ? date : null,
          liquidatedAt: status === "LIQUIDATED" ? new Date(date.getTime() + 20 * 86400_000) : null,
          cancelledAt: status === "CANCELLED" ? new Date(date.getTime() + 10 * 86400_000) : null,
          cancelReason: status === "CANCELLED" ? "Requirement withdrawn" : null,
          source: "DEV_SEED",
        },
      });
      commitments++;
    }
  }
  return { expRows, revRows, commitments };
}

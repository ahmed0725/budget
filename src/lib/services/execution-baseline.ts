/**
 * Publishing an approved budget creates its execution baseline (budget_execution):
 * one row per MDA / code (or capital project) holding the original approved amount
 * and the revised amount. Publishing an approved revision updates the revised
 * amounts while the original approved amounts stay untouched.
 */
import { toAmount } from "@/lib/calculations";
import type { Tx } from "@/lib/db";

export function allocationKey(line: { budgetCodeId: string; capitalProjectId: string | null }) {
  return line.capitalProjectId ? `P:${line.capitalProjectId}` : `C:${line.budgetCodeId}`;
}

export async function publishAllocations(tx: Tx, submissionId: string): Promise<{ created: number; updated: number }> {
  const s = await tx.budgetSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  const lines = await tx.budgetLine.findMany({ where: { submissionId } });
  const existing = await tx.budgetAllocation.findMany({ where: { budgetYearId: s.budgetYearId, mdaId: s.mdaId } });
  const byKey = new Map(existing.map((a) => [`${a.kind}|${a.lineKey}`, a]));
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  // Aggregate lines by allocation key (one row per code or project).
  const totals = new Map<string, { kind: "REVENUE" | "EXPENDITURE"; budgetCodeId: string; capitalProjectId: string | null; amount: number }>();
  for (const l of lines) {
    const key = `${l.kind}|${allocationKey(l)}`;
    const cur = totals.get(key);
    totals.set(key, { kind: l.kind, budgetCodeId: l.budgetCodeId, capitalProjectId: l.capitalProjectId, amount: toAmount((cur?.amount ?? 0) + toAmount(l.amount)) });
  }

  for (const [key, t] of totals) {
    seen.add(key);
    const current = byKey.get(key);
    const lineKey = key.split("|")[1];
    if (!current) {
      await tx.budgetAllocation.create({
        data: {
          budgetYearId: s.budgetYearId,
          mdaId: s.mdaId,
          budgetCodeId: t.budgetCodeId,
          kind: t.kind,
          capitalProjectId: t.capitalProjectId,
          lineKey,
          // A line first introduced by a revision had no original approved amount.
          originalAmount: s.type === "REVISION" ? 0 : t.amount,
          revisedAmount: t.amount,
          sourceSubmissionId: s.type === "REVISION" && s.parentSubmissionId ? s.parentSubmissionId : s.id,
          revisionSubmissionId: s.type === "REVISION" ? s.id : null,
          source: s.source === "DEV_SEED" ? "DEV_SEED" : "SYSTEM",
        },
      });
      created++;
    } else {
      await tx.budgetAllocation.update({
        where: { id: current.id },
        data: {
          revisedAmount: t.amount,
          ...(s.type === "ORIGINAL" ? { originalAmount: t.amount, sourceSubmissionId: s.id } : { revisionSubmissionId: s.id }),
        },
      });
      updated++;
    }
  }
  // Lines removed by a revision keep their original amount but have no revised budget.
  if (s.type === "REVISION") {
    for (const a of existing) {
      if (!seen.has(`${a.kind}|${a.lineKey}`)) {
        await tx.budgetAllocation.update({ where: { id: a.id }, data: { revisedAmount: 0, revisionSubmissionId: s.id } });
        updated++;
      }
    }
  }
  return { created, updated };
}

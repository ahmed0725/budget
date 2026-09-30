/**
 * Budget versioning. Versions are immutable snapshots (the budget_versions table is
 * append-only). A version is created on submission, return, resubmission, approval
 * and whenever a user saves a checkpoint; drafts can be restored from any version.
 */
import type { Prisma, SubmissionStatus } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { toAmount } from "@/lib/calculations";
import type { Tx } from "@/lib/db";
import { buildSnapshot, loadSubmissionBundle, snapshotTotals, type SubmissionBundle, type SubmissionSnapshot } from "./submission-data";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  RECOMMENDED: "Recommended",
  ENDORSED: "Endorsed",
  RETURNED: "Returned",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PUBLISHED: "Published",
};

export interface SnapshotDiff {
  totals: Record<string, { from: number; to: number }>;
  lines: {
    added: { code: string; amount: number }[];
    removed: { code: string; amount: number }[];
    changed: { code: string; from: number; to: number }[];
  };
  personnel: { from: number; to: number };
  capital: { from: number; to: number };
  procurement: { from: number; to: number };
  summary: string;
}

type LineLike = { code: string; budgetCodeId: string; amount: number };

function lineMap(snapshot: SubmissionSnapshot): Map<string, LineLike> {
  const map = new Map<string, LineLike>();
  for (const l of snapshot.expenditureLines) map.set(`E:${l.budgetCodeId}`, l);
  for (const l of snapshot.revenueLines) map.set(`R:${l.budgetCodeId}`, l);
  for (const c of snapshot.capital) map.set(`C:${c.projectId ?? c.lineId}`, { code: `${c.code} ${c.name}`, budgetCodeId: c.budgetCodeId, amount: c.allocation });
  return map;
}

/** Describe what changed between two snapshots. */
export function diffSnapshots(prev: SubmissionSnapshot | null, next: SubmissionSnapshot, prevTotals?: Record<string, unknown>, nextTotals?: Record<string, unknown>): SnapshotDiff {
  const totals: SnapshotDiff["totals"] = {};
  for (const key of ["expenditure", "revenue", "personnel", "capital", "recurrent"]) {
    const from = toAmount((prevTotals?.[key] as number) ?? 0);
    const to = toAmount((nextTotals?.[key] as number) ?? 0);
    if (from !== to) totals[key] = { from, to };
  }
  const before = prev ? lineMap(prev) : new Map<string, LineLike>();
  const after = lineMap(next);
  const added: SnapshotDiff["lines"]["added"] = [];
  const removed: SnapshotDiff["lines"]["removed"] = [];
  const changed: SnapshotDiff["lines"]["changed"] = [];
  for (const [k, l] of after) {
    const b = before.get(k);
    if (!b) added.push({ code: l.code, amount: l.amount });
    else if (toAmount(b.amount) !== toAmount(l.amount)) changed.push({ code: l.code, from: toAmount(b.amount), to: toAmount(l.amount) });
  }
  for (const [k, l] of before) if (!after.has(k)) removed.push({ code: l.code, amount: l.amount });

  const parts: string[] = [];
  if (!prev) parts.push("Initial version");
  if (added.length) parts.push(`${added.length} line(s) added`);
  if (removed.length) parts.push(`${removed.length} line(s) removed`);
  if (changed.length) parts.push(`${changed.length} line(s) changed`);
  if (totals.expenditure) parts.push(`total ${totals.expenditure.from.toLocaleString("en-US")} → ${totals.expenditure.to.toLocaleString("en-US")}`);
  return {
    totals,
    lines: { added, removed, changed },
    personnel: { from: prev?.personnel.length ?? 0, to: next.personnel.length },
    capital: { from: prev?.capital.length ?? 0, to: next.capital.length },
    procurement: { from: prev?.procurement.length ?? 0, to: next.procurement.length },
    summary: parts.length ? parts.join("; ") : "No changes since the previous version",
  };
}

export async function createVersion(
  tx: Tx,
  actor: Actor | null,
  submissionId: string,
  opts: { reason?: string | null; status?: SubmissionStatus; label?: string; bundle?: SubmissionBundle } = {},
) {
  const bundle = opts.bundle ?? (await loadSubmissionBundle(tx, submissionId));
  const status = opts.status ?? bundle.submission.status;
  const previous = await tx.budgetVersion.findFirst({ where: { submissionId }, orderBy: { versionNumber: "desc" } });
  const versionNumber = (previous?.versionNumber ?? 0) + 1;
  const snapshot = buildSnapshot(bundle);
  snapshot.submission.status = status;
  const totals = snapshotTotals(bundle);
  const changes = diffSnapshots(
    (previous?.snapshot as unknown as SubmissionSnapshot) ?? null,
    snapshot,
    (previous?.totals as Record<string, unknown>) ?? undefined,
    totals as unknown as Record<string, unknown>,
  );
  const label = opts.label ?? `${bundle.submission.type === "REVISION" ? "Revision " : ""}${STATUS_LABEL[status]} v${versionNumber}`;
  return tx.budgetVersion.create({
    data: {
      submissionId,
      versionNumber,
      label,
      status,
      reason: opts.reason ?? null,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
      totals: JSON.parse(JSON.stringify(totals)) as Prisma.InputJsonValue,
      changes: JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue,
      isImmutable: status === "APPROVED" || status === "PUBLISHED",
      createdById: actor && actor.id !== "system" ? actor.id : null,
    },
  });
}

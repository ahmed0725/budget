import { prisma } from "@/lib/db";
import type { SnapshotDiff } from "@/lib/services/versions";
import { getWorkspace } from "../data";
import { HistoryView } from "./history-view";

export default async function HistoryPage({ params }: PageProps<"/budget/workspace/[id]/history">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const [versions, audits] = await Promise.all([
    prisma.budgetVersion.findMany({ where: { submissionId: id }, orderBy: { versionNumber: "desc" }, include: { createdBy: { select: { fullName: true } } } }),
    ws.actor.permissions.has("audit.view") || ws.permissions.isAgency || ws.permissions.isReviewer
      ? prisma.auditLog.findMany({ where: { OR: [{ entityId: id }, { entityType: { in: ["Certification"] }, entityId: id }] }, orderBy: { id: "desc" }, take: 100 })
      : Promise.resolve([]),
  ]);
  return (
    <HistoryView
      submissionId={id}
      canRestore={ws.permissions.canRestore}
      versions={versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        label: v.label,
        status: v.status,
        reason: v.reason,
        isImmutable: v.isImmutable,
        createdBy: v.createdBy?.fullName ?? "System",
        createdAt: v.createdAt.toISOString(),
        totals: v.totals as Record<string, number>,
        changes: (v.changes as unknown as SnapshotDiff) ?? null,
      }))}
      audits={audits.map((a) => ({
        id: a.id.toString(),
        action: a.action,
        entityType: a.entityType,
        userName: a.userName,
        summary: a.summary,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
        oldValue: a.oldValue,
        newValue: a.newValue,
        ip: a.ip,
      }))}
    />
  );
}

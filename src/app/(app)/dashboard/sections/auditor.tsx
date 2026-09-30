import Link from "next/link";
import { daysAgo } from "@/lib/budget-years";
import { StatCard } from "@/components/app/stat-card";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";

/** Auditor: audit activity, changes, approvals, versions and execution history. */
export async function AuditorSection({ actor: _actor }: { actor: Actor }) {
  const { t, locale } = await getT();
  const settings = await getSettings();
  const since = daysAgo(30);
  const [activity, changes, approvals, versions, recent, execUpdates] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since }, action: { in: ["UPDATE", "DELETE", "RESTORE"] } } }),
    prisma.approvalStep.count({ where: { createdAt: { gte: since }, action: { in: ["APPROVE", "ENDORSE", "RECOMMEND", "PUBLISH"] } } }),
    prisma.budgetVersion.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 12, select: { id: true, action: true, entityType: true, summary: true, userName: true, createdAt: true } }),
    prisma.expenditureExecution.count({ where: { updatedAt: { gte: since } } }),
  ]);
  return (
    <section aria-labelledby="auditor-title" className="space-y-3">
      <h2 id="auditor-title" className="text-sm font-semibold">
        {t("audit.title")} — {t("dashboard.last30Days")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("dashboard.recentActivity")} value={activity.toLocaleString("en-US")} href="/audit/logs" />
        <StatCard label={t("dashboard.changes")} value={changes.toLocaleString("en-US")} href="/audit/logs?action=UPDATE" />
        <StatCard label={t("dashboard.approvals")} value={approvals.toLocaleString("en-US")} href="/audit/logs?action=APPROVE" />
        <StatCard label={t("dashboard.budgetVersions")} value={versions.toLocaleString("en-US")} />
        <StatCard label={t("nav.execution")} value={execUpdates.toLocaleString("en-US")} href="/execution/monthly" />
      </div>
      <div className="rounded-lg border bg-card">
        <ul className="divide-y text-sm">
          {recent.map((r) => (
            <li key={r.id.toString()} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
              <span className="rounded bg-muted px-1.5 font-mono text-[11px]">{r.action}</span>
              <span className="min-w-0 flex-1 truncate">{r.summary ?? r.entityType}</span>
              <span className="text-xs text-muted-foreground">
                {r.userName ?? "System"} · {formatDateTime(r.createdAt, { timezone: settings.timezone, locale })}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t px-4 py-2">
          <Link href="/audit/logs" className="text-xs text-primary hover:underline">
            {t("dashboard.viewAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}

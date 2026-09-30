"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Lock, RotateCcw } from "lucide-react";
import { AuditTimeline, type AuditEntryView } from "@/components/app/audit-timeline";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import type { SnapshotDiff } from "@/lib/services/versions";
import { restoreVersionAction } from "../../../actions";

interface Version {
  id: string;
  versionNumber: number;
  label: string;
  status: string;
  reason: string | null;
  isImmutable: boolean;
  createdBy: string;
  createdAt: string;
  totals: Record<string, number>;
  changes: SnapshotDiff | null;
}

export function HistoryView({ submissionId, canRestore, versions, audits }: { submissionId: string; canRestore: boolean; versions: Version[]; audits: AuditEntryView[] }) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <section aria-labelledby="versions-title" className="space-y-3">
        <h2 id="versions-title" className="text-lg font-semibold">
          {t("budget.versions")}
        </h2>
        {versions.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : null}
        <ol className="space-y-3">
          {versions.map((v, i) => (
            <li key={v.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{v.label}</span>
                  <StatusBadge status={v.status} />
                  {v.isImmutable ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {t("common.readOnly")}
                    </span>
                  ) : null}
                </div>
                {canRestore && i > 0 ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm">
                        <RotateCcw aria-hidden />
                        {t("budget.restore")}
                      </Button>
                    }
                    title={`${t("budget.restore")}: ${v.label}`}
                    description={t("budget.restoreConfirm")}
                    onConfirm={async () => {
                      if (handleResult(await restoreVersionAction(submissionId, v.id, `Restored ${v.label}`), t("common.saved"))) router.refresh();
                    }}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {v.createdBy} · {fmt.dateTime(v.createdAt)}
              </p>
              {v.reason ? <p className="mt-2 text-sm">{v.reason}</p> : null}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("dashboard.totalExpenditure")}</dt>
                  <dd className="num font-medium">{fmt.money(v.totals.expenditure)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("dashboard.totalRevenue")}</dt>
                  <dd className="num font-medium">{fmt.money(v.totals.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("nav.personnel")}</dt>
                  <dd className="num">{fmt.money(v.totals.personnel)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("dashboard.capitalBudget")}</dt>
                  <dd className="num">{fmt.money(v.totals.capital)}</dd>
                </div>
              </dl>
              {v.changes ? (
                <Collapsible>
                  <CollapsibleTrigger className="group mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    {t("budget.changes")}: {v.changes.summary}
                    <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 text-xs">
                      {v.changes.lines.changed.length ? (
                        <ul className="space-y-0.5">
                          {v.changes.lines.changed.slice(0, 50).map((c, j) => (
                            <li key={j} className="num">
                              {c.code}: {fmt.money(c.from)} → {fmt.money(c.to)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {v.changes.lines.added.length ? (
                        <p>
                          + {v.changes.lines.added.map((a) => `${a.code} (${fmt.compact(a.amount)})`).slice(0, 20).join(", ")}
                        </p>
                      ) : null}
                      {v.changes.lines.removed.length ? (
                        <p>
                          − {v.changes.lines.removed.map((a) => `${a.code} (${fmt.compact(a.amount)})`).slice(0, 20).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="audit-title" className="space-y-3">
        <h2 id="audit-title" className="text-lg font-semibold">
          {t("audit.title")}
        </h2>
        <AuditTimeline entries={audits} />
      </section>
    </div>
  );
}

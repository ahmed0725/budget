"use client";

import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, Info, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { ManagementAlert } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

const ICON = { critical: AlertOctagon, serious: ShieldAlert, warning: AlertTriangle, info: Info };
const TONE = {
  critical: "border-destructive/40 bg-destructive/5 text-destructive",
  serious: "border-destructive/25 bg-destructive/[0.03]",
  warning: "border-warning/50 bg-warning/10",
  info: "border-info/30 bg-info/5",
};
const LABEL = { critical: "Critical", serious: "Serious", warning: "Warning", info: "Info" };

export function AlertsPanel({ alerts }: { alerts: ManagementAlert[] }) {
  const { t } = useT();
  return (
    <section aria-labelledby="alerts-title" className="space-y-2">
      <h2 id="alerts-title" className="text-sm font-semibold">
        {t("dashboard.alerts")}
      </h2>
      {alerts.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{t("dashboard.noAlerts")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {alerts.map((a) => {
            const Icon = ICON[a.severity];
            return (
              <li key={a.key}>
                <Link href={a.href} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring", TONE[a.severity])}>
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      <span className="sr-only">{LABEL[a.severity]}: </span>
                      {a.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">{a.detail}</span>
                  </span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

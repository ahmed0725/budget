"use client";

import { ChevronDown } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useT } from "@/lib/i18n/client";

export interface AuditEntryView {
  id: string;
  action: string;
  entityType: string;
  userName: string | null;
  summary: string | null;
  reason: string | null;
  createdAt: string;
  oldValue: unknown;
  newValue: unknown;
  ip?: string | null;
}

export function AuditTimeline({ entries }: { entries: AuditEntryView[] }) {
  const { t } = useT();
  const fmt = useFormat();
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{e.action}</span>
            <span className="text-xs text-muted-foreground">{e.entityType}</span>
            <span className="ml-auto text-xs text-muted-foreground">{fmt.dateTime(e.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm">{e.summary ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {e.userName ?? "System"}
            {e.ip ? ` · ${e.ip}` : ""}
            {e.reason ? ` · ${t("common.reason")}: ${e.reason}` : ""}
          </p>
          {e.oldValue || e.newValue ? (
            <Collapsible>
              <CollapsibleTrigger className="group mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                {t("common.details")}
                <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase">{t("audit.oldValue")}</p>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted/60 p-2 text-[11px] leading-snug">{JSON.stringify(e.oldValue, null, 1) ?? "—"}</pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase">{t("audit.newValue")}</p>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted/60 p-2 text-[11px] leading-snug">{JSON.stringify(e.newValue, null, 1) ?? "—"}</pre>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

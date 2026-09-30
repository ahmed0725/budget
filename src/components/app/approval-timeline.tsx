"use client";

import { Check, Circle, CircleDot } from "lucide-react";
import { useFormat } from "@/components/providers";
import { tDynamic } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

export interface TimelineStep {
  id: string;
  stage: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string | null;
  comment: string | null;
  createdAt: string;
  versionLabel?: string | null;
}

const STAGES = ["PREPARATION", "BUDGET_OFFICER_REVIEW", "DIRECTOR_REVIEW", "FINAL_APPROVAL", "PUBLICATION"] as const;

/** Stage progress bar followed by the chronological history of workflow actions. */
export function ApprovalTimeline({ steps, currentStage, status }: { steps: TimelineStep[]; currentStage: string; status: string }) {
  const { t } = useT();
  const fmt = useFormat();
  const currentIndex = STAGES.indexOf(currentStage as (typeof STAGES)[number]);
  const finished = status === "APPROVED" || status === "PUBLISHED";

  return (
    <div className="space-y-5">
      <ol className="grid gap-2 sm:grid-cols-5" aria-label={t("workflow.timeline")}>
        {STAGES.map((stage, i) => {
          const done = finished ? (status === "PUBLISHED" ? true : i < 4) : i < currentIndex;
          const current = !done && i === currentIndex;
          return (
            <li key={stage} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-xs", done && "border-success/30 bg-success/5", current && "border-primary/40 bg-primary/5")} aria-current={current ? "step" : undefined}>
              {done ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : current ? <CircleDot className="size-4 shrink-0 text-primary" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className={cn(current && "font-medium")}>{t(`workflow.stage.${stage}`)}</span>
            </li>
          );
        })}
      </ol>
      <ol className="relative space-y-4 border-l pl-5">
        {steps.map((s) => (
          <li key={s.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary ring-1 ring-primary/40" aria-hidden />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{tDynamic(t, "workflow", s.action)}</span>
              <StatusBadge status={s.toStatus} />
              {s.versionLabel ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{s.versionLabel}</span> : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {s.actorName ?? "System"} · {fmt.dateTime(s.createdAt)} · {t(`workflow.stage.${s.stage}` as "workflow.stage.PREPARATION")}
            </p>
            {s.comment ? <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">{s.comment}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

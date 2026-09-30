import { cn } from "@/lib/utils";

export interface Phase {
  key: string;
  label: string;
  from: Date | null;
  to: Date | null;
  /** Pre-formatted date range for display. */
  range: string;
}

/**
 * Budget calendar strip: one segment per phase, the phase containing today is
 * highlighted and completed phases are marked. Text carries the state, not colour alone.
 */
export function YearTimeline({ phases, today = new Date(), currentLabel, className }: { phases: Phase[]; today?: Date; currentLabel: string; className?: string }) {
  return (
    <ol className={cn("grid gap-1 sm:grid-cols-5", className)}>
      {phases.map((p) => {
        const done = p.to !== null && p.to < today;
        const current = p.from !== null && p.from <= today && (p.to === null || p.to >= today);
        return (
          <li
            key={p.key}
            aria-current={current ? "step" : undefined}
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              current && "border-primary/50 bg-primary/5",
              done && !current && "bg-muted/60 text-muted-foreground",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{p.label}</span>
              {current ? <span className="rounded bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground">{currentLabel}</span> : done ? <span aria-hidden>✓</span> : null}
            </div>
            <div className="num mt-0.5 text-muted-foreground">{p.range}</div>
          </li>
        );
      })}
    </ol>
  );
}

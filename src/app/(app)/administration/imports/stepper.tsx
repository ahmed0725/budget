import { Check } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const STEPS = ["upload", "detect", "map", "validate", "preview", "import", "summary"] as const;
export type ImportStep = (typeof STEPS)[number];

/** Upload → Detect → Map → Validate → Preview → Import → Summary. */
export async function ImportStepper({ current, done = false }: { current: ImportStep; done?: boolean }) {
  const { t } = await getT();
  const index = STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs" aria-label={t("imports.title")}>
      {STEPS.map((s, i) => {
        const complete = i < index || (done && i === index);
        const active = i === index && !done;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                complete && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !complete && !active && "text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("mr-2", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{t(`imports.${s}`)}</span>
            {i < STEPS.length - 1 ? <span className="mr-1 hidden h-px w-5 bg-border sm:inline-block" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ValidationPanel, ValidationSummary } from "@/components/app/validation-panel";
import type { CheckResult } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";

const FORM_ANCHOR: Record<string, string> = { VALIDATION: "validation", CERTIFICATION: "certification", GENERAL: "d" };

export function ValidationView({ submissionId, checks, tally, lastRun }: { submissionId: string; checks: CheckResult[]; tally: { passed: number; warnings: number; errors: number }; lastRun: string | null }) {
  const { t } = useT();
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("validation.title")}</h2>
          <ValidationSummary {...tally} />
          {lastRun ? <p className="text-xs text-muted-foreground">{lastRun}</p> : null}
        </div>
        {tally.errors > 0 ? (
          <p className="flex max-w-md items-start gap-2 rounded-md bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("validation.blocking")}
          </p>
        ) : (
          <p className="flex max-w-md items-start gap-2 rounded-md bg-success/5 p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("validation.allPassed")}
          </p>
        )}
      </div>
      <ValidationPanel checks={checks} formHref={(form) => `/budget/workspace/${submissionId}/${FORM_ANCHOR[form] ?? form.toLowerCase()}`} />
    </div>
  );
}

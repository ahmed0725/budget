"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CheckResult } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

const CONSISTENCY = new Set(["PERSONNEL_CONSISTENCY", "TOTAL_BUDGET_CONSISTENCY", "CASH_FLOW_CONSISTENCY", "PROCUREMENT_LIMIT", "BALANCED_BUDGET"]);

export function ValidationSummary({ passed, warnings, errors, className }: { passed: number; warnings: number; errors: number; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn("flex flex-wrap gap-x-5 gap-y-1 text-sm", className)} role="status">
      <span className="inline-flex items-center gap-1.5 text-success">
        <CheckCircle2 className="size-4" aria-hidden />
        {t("validation.checksPassed", { count: passed })}
      </span>
      <span className={cn("inline-flex items-center gap-1.5", warnings ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
        <AlertTriangle className="size-4" aria-hidden />
        {t("validation.warnings", { count: warnings })}
      </span>
      <span className={cn("inline-flex items-center gap-1.5", errors ? "text-destructive" : "text-muted-foreground")}>
        <XCircle className="size-4" aria-hidden />
        {t("validation.errors", { count: errors })}
      </span>
    </div>
  );
}

export function ValidationPanel({ checks, formHref }: { checks: CheckResult[]; formHref: (form: string, field: string | null) => string | null }) {
  const { t } = useT();
  const fmt = useFormat();
  const consistency = checks.filter((c) => CONSISTENCY.has(c.ruleCode));
  const others = checks.filter((c) => !CONSISTENCY.has(c.ruleCode)).sort((a, b) => rank(a.status) - rank(b.status));

  const row = (c: CheckResult, withValues: boolean) => {
    const href = formHref(c.form, c.field);
    return (
      <tr key={c.ruleCode} className={cn("border-b align-top last:border-0", c.status === "ERROR" && "bg-destructive/[0.03]", c.status === "WARNING" && "bg-warning/[0.05]")}>
        <th scope="row" className="px-3 py-2.5 text-left font-medium">
          {c.name}
          {c.details.length ? (
            <Collapsible>
              <CollapsibleTrigger className="group mt-1 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground">
                {c.details.length} {t("common.details").toLowerCase()}
                <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs font-normal text-muted-foreground">
                  {c.details.slice(0, 30).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </th>
        {withValues ? (
          <>
            <td className="num px-3 py-2.5 text-right">{c.calculated !== null ? fmt.money(c.calculated) : "—"}</td>
            <td className="num px-3 py-2.5 text-right">{c.expected !== null ? fmt.money(c.expected) : "—"}</td>
            <td className={cn("num px-3 py-2.5 text-right", c.difference && Math.abs(c.difference) >= 1 ? "font-medium" : "text-muted-foreground")}>{c.difference !== null ? fmt.money(c.difference, { signed: true }) : "—"}</td>
          </>
        ) : null}
        <td className="px-3 py-2.5">
          <StatusBadge status={c.status} />
        </td>
        <td className="px-3 py-2.5 text-sm">
          <p>{c.message}</p>
          {c.status !== "PASS" && c.action ? (
            href ? (
              <Link href={href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                {c.action}
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{c.action}</p>
            )
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="consistency-title" className="space-y-2">
        <h3 id="consistency-title" className="text-sm font-semibold">
          HUBINTA TOOSAN — ISKU-WAAFAJINTA FOOMAMKA
        </h3>
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="w-[28%] px-3 py-2 text-left font-medium">{t("validation.check")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.calculated")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.expected")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.difference")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("validation.result")}</th>
                <th scope="col" className="w-[26%] px-3 py-2 text-left font-medium">{t("budget.explanation")}</th>
              </tr>
            </thead>
            <tbody>{consistency.map((c) => row(c, true))}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="completeness-title" className="space-y-2">
        <h3 id="completeness-title" className="text-sm font-semibold">
          {t("validation.title")}
        </h3>
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="w-[34%] px-3 py-2 text-left font-medium">{t("validation.check")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("validation.result")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("budget.explanation")}</th>
              </tr>
            </thead>
            <tbody>{others.map((c) => row(c, false))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function rank(status: string) {
  return status === "ERROR" ? 0 : status === "WARNING" ? 1 : 2;
}

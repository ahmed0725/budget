import type { Metadata } from "next";
import { Download } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { toAmount } from "@/lib/calculations";
import { formatMoney, formatPercent, MONTH_NAMES } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { executionSummary, revenueMonthly } from "@/lib/services/analytics";
import { executionLines } from "@/lib/services/execution";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { MonthlyBars } from "../execution-charts";
import { RecordActualDialog } from "../execution-client";

export const metadata: Metadata = { title: "Revenue collection" };

export default async function RevenueExecutionPage(props: PageProps<"/execution/revenue">) {
  const actor = await requirePagePermission("execution.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp, "execution");
  const mdaId = await resolveMda(sp);
  const q = param(sp, "q")?.trim() || undefined;
  const options = await filterOptions(actor, locale);
  const yearRecord = options.yearRecords.find((y) => y.year === year);
  const executing = options.yearRecords.filter((y) => ["ACTIVE", "PUBLISHED", "CLOSED"].includes(y.status));
  const [summary, monthly, lines] = await Promise.all([executionSummary(actor, year, { mdaId }), revenueMonthly(actor, year, { mdaId }), executionLines(actor, { year, kind: "REVENUE", mdaId, q })]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const lastMonth = Math.max(0, ...monthly.filter((m) => m.actual !== 0).map((m) => m.month));
  const targetToDate = toAmount(monthly.filter((m) => m.month <= lastMonth).reduce((s, m) => s + m.target, 0));
  const canRecord = can(actor, "execution.manage") && yearRecord && ["ACTIVE", "PUBLISHED"].includes(yearRecord.status);
  const revenueMdas = options.mdas.filter((m) => lines.some((l) => l.mdaId === m.value) || m.value === mdaId);
  const query = new URLSearchParams(Object.entries({ kind: "REVENUE", year: String(year), mda: mdaId }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.revenueExecution")}
        description={`${year}${lastMonth ? ` · ${t("execution.actualsThrough", { month: MONTH_NAMES[locale][lastMonth - 1] })}` : ""}`}
        breadcrumbs={[{ label: t("nav.execution") }, { label: t("nav.revenueExecution") }]}
        actions={
          <>
            {can(actor, "reports.export") ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/execution?${query}`}>
                  <Download aria-hidden />
                  {t("common.exportCsv")}
                </a>
              </Button>
            ) : null}
            {canRecord ? <RecordActualDialog year={year} kind="REVENUE" mdas={revenueMdas.length ? revenueMdas : options.mdas} defaultMdaId={mdaId ?? (revenueMdas.length === 1 ? revenueMdas[0].value : undefined)} /> : null}
          </>
        }
      />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: executing.map((y) => ({ value: String(y.year), label: String(y.year) })), required: true, width: "w-28", defaultValue: String(year) },
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-72" },
          { type: "search", key: "q", label: t("common.search") },
        ]}
      />
      <StatGrid>
        <StatCard label={t("execution.revenueTarget")} value={money(summary.revenueTarget)} />
        <StatCard label={t("execution.actualRevenue")} value={money(summary.revenueActual)} hint={`${t("common.collectionRate")}: ${formatPercent(summary.collectionRate)}`} />
        <StatCard label={t("execution.targetToDate")} value={money(targetToDate)} />
        <StatCard label={t("execution.revenueVariance")} value={formatMoney(toAmount(summary.revenueActual - targetToDate), { currencySymbol: settings.currency.symbol, signed: true })} hint={t("execution.varianceToDateHint")} />
      </StatGrid>
      <MonthlyBars
        title={t("execution.monthlyCollections")}
        description={`${year} · ${t("common.target")} / ${t("common.actual")}`}
        data={monthly.map((m) => ({ month: MONTH_NAMES[locale][m.month - 1], target: m.target, actual: m.actual }))}
        labels={{ target: t("common.target"), actual: t("common.actual"), month: t("common.month") }}
      />
      <section className="rounded-lg border bg-card" aria-labelledby="rev-lines">
        <h2 id="rev-lines" className="border-b px-4 py-3 text-sm font-semibold">
          {t("execution.bySource")}
        </h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.code")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.revenueTarget")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.actualRevenue")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.remaining")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.collectionRate")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.mdaId}-${l.codeId}`} className="border-b last:border-0 hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="num font-medium">{l.code}</span> {l.codeName}
                  </th>
                  <td className="num px-3 py-2 text-xs">{l.mdaCode}</td>
                  <td className="num px-3 py-2 text-right">{money(l.revised)}</td>
                  <td className="num px-3 py-2 text-right">{money(l.actual)}</td>
                  <td className="num px-3 py-2 text-right">{money(l.available)}</td>
                  <td className={cn("num px-3 py-2 text-right", l.rate !== null && l.rate < settings.budget.revenueAlertPercent * (lastMonth / 12) && "font-medium text-destructive")}>{formatPercent(l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

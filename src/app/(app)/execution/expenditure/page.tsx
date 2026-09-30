import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { formatMoney, formatPercent, MONTH_NAMES } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { executionByMda, executionSummary, expenditureMonthly } from "@/lib/services/analytics";
import { executionLines } from "@/lib/services/execution";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { RecordActualDialog } from "../execution-client";
import { ExecutionTrend } from "../execution-charts";

export const metadata: Metadata = { title: "Expenditure execution" };

export default async function ExpenditureExecutionPage(props: PageProps<"/execution/expenditure">) {
  const actor = await requirePagePermission("execution.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp, "execution");
  const mdaId = (await resolveMda(sp)) || (actor.allMdas ? undefined : actor.assignments[0]?.mdaId);
  const sectorId = param(sp, "sector");
  const q = param(sp, "q")?.trim() || undefined;
  const options = await filterOptions(actor, locale);
  const yearRecord = options.yearRecords.find((y) => y.year === year);
  const executing = options.yearRecords.filter((y) => ["ACTIVE", "PUBLISHED", "CLOSED"].includes(y.status));
  const [summary, monthly, byMda, lines] = await Promise.all([
    executionSummary(actor, year, { mdaId, sectorId }),
    expenditureMonthly(actor, year, { mdaId, sectorId }),
    mdaId ? Promise.resolve([]) : executionByMda(actor, year, { sectorId }),
    mdaId ? executionLines(actor, { year, kind: "EXPENDITURE", mdaId, q }) : Promise.resolve([]),
  ]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const lastMonth = summary.lastActualMonth;
  const canRecord = can(actor, "execution.manage") && yearRecord && ["ACTIVE", "PUBLISHED"].includes(yearRecord.status);
  const query = new URLSearchParams(Object.entries({ kind: "EXPENDITURE", year: String(year), mda: mdaId, sector: sectorId }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.expenditureExecution")}
        description={`${year}${lastMonth ? ` · ${t("execution.actualsThrough", { month: MONTH_NAMES[locale][lastMonth - 1] })}` : ""}`}
        breadcrumbs={[{ label: t("nav.execution") }, { label: t("nav.expenditureExecution") }]}
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
            {canRecord ? <RecordActualDialog year={year} kind="EXPENDITURE" mdas={options.mdas} defaultMdaId={mdaId} /> : null}
          </>
        }
      />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: executing.map((y) => ({ value: String(y.year), label: String(y.year) })), required: true, width: "w-28", defaultValue: String(year) },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-72" },
          ...(mdaId ? [{ type: "search" as const, key: "q", label: t("common.search") }] : []),
        ]}
      />
      {summary.revisedBudget === 0 ? <EmptyState title={t("execution.noAllocations")} /> : null}
      <StatGrid>
        <StatCard label={t("execution.approvedBudget")} value={money(summary.originalBudget)} hint={summary.revisedBudget !== summary.originalBudget ? `${t("execution.revisedBudget")}: ${money(summary.revisedBudget)}` : undefined} />
        <StatCard label={t("execution.actualExpenditure")} value={money(summary.actual)} hint={`${t("common.executionRate")}: ${formatPercent(summary.executionRate)}`} />
        <StatCard label={t("execution.commitments")} value={money(summary.committed)} hint={`${t("execution.obligations")}: ${money(summary.obligated)}`} href="/execution/commitments" />
        <StatCard label={t("execution.availableBalance")} value={money(summary.available)} />
      </StatGrid>
      <ExecutionTrend
        title={t("execution.cumulativeTitle")}
        description={`${year} · ${t("common.planned")} / ${t("common.actual")}`}
        data={monthly.map((m) => ({ month: MONTH_NAMES[locale][m.month - 1], planned: m.cumulativePlanned, actual: lastMonth && m.month <= lastMonth ? m.cumulativeActual : null }))}
        labels={{ planned: t("common.planned"), actual: t("common.actual"), month: t("common.month") }}
      />
      {!mdaId ? (
        <section className="rounded-lg border bg-card" aria-labelledby="ex-mda">
          <h2 id="ex-mda" className="border-b px-4 py-3 text-sm font-semibold">
            {t("execution.byMda")}
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.revisedBudget")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.actual")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.committed")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.available")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.executionRate")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.varianceToPlan")}</th>
                </tr>
              </thead>
              <tbody>
                {byMda.map((r) => (
                  <tr key={r.mdaId} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link href={`/execution/expenditure?year=${year}&mda=${r.mdaId}`} className="hover:underline">
                        <span className="num font-medium">{r.code}</span> {locale === "en" && r.nameEn ? r.nameEn : r.name}
                      </Link>
                    </td>
                    <td className="num px-3 py-2 text-right">{money(r.budget)}</td>
                    <td className="num px-3 py-2 text-right">{money(r.actual)}</td>
                    <td className="num px-3 py-2 text-right">{money(r.committed)}</td>
                    <td className={cn("num px-3 py-2 text-right", r.available < 0 && "font-medium text-destructive")}>{money(r.available)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(r.executionRate)}</td>
                    <td className="num px-3 py-2 text-right">{formatMoney(r.variance, { currencySymbol: settings.currency.symbol, signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border bg-card" aria-labelledby="ex-lines">
          <h2 id="ex-lines" className="border-b px-4 py-3 text-sm font-semibold">
            {t("execution.byCode")}
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">{t("common.code")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.revisedBudget")}</th>
                  {MONTH_NAMES[locale].map((m, i) => (
                    <th key={m} scope="col" className={cn("px-2 py-2 text-right font-medium", lastMonth && i + 1 > lastMonth && "opacity-50")}>
                      {m}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.actual")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.committed")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.available")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.codeId} className="border-b last:border-0 hover:bg-muted/40">
                    <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal">
                      <span className="num font-medium">{l.code}</span> <span className="text-xs">{l.codeName}</span>
                    </th>
                    <td className="num px-3 py-2 text-right">{money(l.revised)}</td>
                    {l.months.map((v, i) => (
                      <td key={i} className="num px-2 py-2 text-right text-xs">
                        {v ? formatMoney(v, { currencySymbol: "", decimals: 0 }) : ""}
                      </td>
                    ))}
                    <td className="num px-3 py-2 text-right font-medium">{money(l.actual)}</td>
                    <td className="num px-3 py-2 text-right">{money(l.committed)}</td>
                    <td className={cn("num px-3 py-2 text-right", l.available < 0 && "font-medium text-destructive")}>{money(l.available)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(l.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

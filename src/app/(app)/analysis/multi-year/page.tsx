import type { Metadata } from "next";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { requirePagePermission } from "@/lib/auth/session";
import { calculateCagr, calculateGrowthRate } from "@/lib/calculations";
import { formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda } from "@/lib/page-params";
import { yearTotals, type Dataset } from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { GroupedCard, TrendCard } from "../analysis-charts";

export const metadata: Metadata = { title: "Multi-year analysis" };

export default async function MultiYearPage(props: PageProps<"/analysis/multi-year">) {
  const actor = await requirePagePermission("analysis.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const dataset: Dataset = param(sp, "dataset") === "approved" ? "approved" : "effective";
  const sectorId = param(sp, "sector");
  const mdaId = await resolveMda(sp);
  const options = await filterOptions(actor, locale);
  const allYears = options.yearRecords.map((y) => y.year).sort((a, b) => a - b);
  const totals = (await yearTotals(actor, allYears, { dataset, sectorId, mdaId })).filter((y) => y.expenditure || y.revenue);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const first = totals[0];
  const last = totals.at(-1);
  const periods = first && last ? last.year - first.year : 0;
  const growth = (key: "expenditure" | "revenue" | "personnel" | "capital", i: number) => (i === 0 ? null : calculateGrowthRate(totals[i][key], totals[i - 1][key]));
  const statusOf = (year: number) => options.yearRecords.find((y) => y.year === year)?.status;

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.multiYear")} description={first && last ? `${first.year}–${last.year}` : undefined} breadcrumbs={[{ label: t("nav.analysis") }, { label: t("nav.multiYear") }]} />
      <FilterBar
        filters={[
          {
            type: "select",
            key: "dataset",
            label: t("analysis.dataset"),
            options: [
              { value: "effective", label: t("analysis.includeProposals") },
              { value: "approved", label: t("analysis.approvedOnly") },
            ],
            required: true,
            width: "w-56",
            defaultValue: dataset,
          },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-72" },
        ]}
      />
      {first && last && periods > 0 ? (
        <StatGrid>
          <StatCard label={`${t("analysis.cagr")} · ${t("budget.expenditureKind")}`} value={formatPercent(calculateCagr(first.expenditure, last.expenditure, periods), 1, { signed: true })} hint={`${first.year}–${last.year}`} />
          <StatCard label={`${t("analysis.cagr")} · ${t("budget.revenueKind")}`} value={formatPercent(calculateCagr(first.revenue, last.revenue, periods), 1, { signed: true })} hint={`${first.year}–${last.year}`} />
          <StatCard label={`${last.year} · ${t("dashboard.totalExpenditure")}`} value={money(last.expenditure)} />
          <StatCard label={`${last.year} · ${t("dashboard.totalRevenue")}`} value={money(last.revenue)} />
        </StatGrid>
      ) : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendCard
          title={t("analysis.revenueExpenditureTrend")}
          xKey="year"
          xLabel={t("common.year")}
          data={totals.map((y) => ({ year: String(y.year), expenditure: y.expenditure, revenue: y.revenue }))}
          series={[
            { key: "revenue", label: t("dashboard.totalRevenue") },
            { key: "expenditure", label: t("dashboard.totalExpenditure") },
          ]}
        />
        <GroupedCard
          title={t("analysis.compositionTrend")}
          xKey="year"
          xLabel={t("common.year")}
          data={totals.map((y) => ({ year: String(y.year), personnel: y.personnel, other: Math.max(0, y.recurrent - y.personnel), capital: y.capital }))}
          series={[
            { key: "personnel", label: t("analysis.personnel") },
            { key: "other", label: t("analysis.otherRecurrent") },
            { key: "capital", label: t("analysis.capital") },
          ]}
        />
      </div>
      <section className="rounded-lg border bg-card" aria-labelledby="my-table">
        <h2 id="my-table" className="border-b px-4 py-3 text-sm font-semibold">
          {t("analysis.yearByYear")}
        </h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.year")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("dashboard.totalRevenue")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.growth")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("dashboard.totalExpenditure")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.growth")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("analysis.personnel")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("analysis.capital")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("analysis.balance")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("nav.mdas")}</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((y, i) => {
                const g = (k: "expenditure" | "revenue") => growth(k, i);
                const bal = y.revenue - y.expenditure;
                return (
                  <tr key={y.year} className="border-b last:border-0 hover:bg-muted/40">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <span className="num">{y.year}</span>
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{statusOf(y.year) ? t(`status.${statusOf(y.year)!}` as "status.DRAFT") : ""}</span>
                    </th>
                    <td className="num px-3 py-2 text-right">{money(y.revenue)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(g("revenue"), 1, { signed: true })}</td>
                    <td className="num px-3 py-2 text-right">{money(y.expenditure)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(g("expenditure"), 1, { signed: true })}</td>
                    <td className="num px-3 py-2 text-right">{money(y.personnel)}</td>
                    <td className="num px-3 py-2 text-right">{money(y.capital)}</td>
                    <td className={cn("num px-3 py-2 text-right", bal < 0 && "text-destructive")}>{formatMoney(bal, { currencySymbol: settings.currency.symbol, signed: true })}</td>
                    <td className="num px-3 py-2 text-right">
                      {y.mdas}
                      {i > 0 && y.mdas < totals[i - 1].mdas ? <span className="ml-1 text-xs font-normal text-muted-foreground">({t("analysis.partial")})</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">{t("analysis.multiYearNote")}</p>
      </section>
    </div>
  );
}

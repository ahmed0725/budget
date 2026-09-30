import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { requirePagePermission } from "@/lib/auth/session";
import { calculateShare, toAmount } from "@/lib/calculations";
import { formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { budgetByCategory, budgetByCodeLevel, budgetByMda, yearTotals, type Dataset } from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { BarCard } from "../analysis-charts";

export const metadata: Metadata = { title: "Budget analysis" };

export default async function BudgetAnalysisPage(props: PageProps<"/analysis/budget">) {
  const actor = await requirePagePermission("analysis.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const dataset: Dataset = param(sp, "dataset") === "approved" ? "approved" : "effective";
  const sectorId = param(sp, "sector");
  const mdaId = await resolveMda(sp);
  const opts = { dataset, sectorId, mdaId };
  const [options, [totals], categories, mdas, revenueSources, economic] = await Promise.all([
    filterOptions(actor, locale),
    yearTotals(actor, [year], opts),
    budgetByCategory(actor, year, opts),
    budgetByMda(actor, year, opts),
    budgetByCodeLevel(actor, year, "REVENUE", 3, opts),
    budgetByCodeLevel(actor, year, "EXPENDITURE", 2, opts),
  ]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const balance = toAmount(totals.revenue - totals.expenditure);
  const en = locale === "en";
  const expenditureCats = categories.filter((c) => c.kind === "EXPENDITURE");
  const drill = (extra: string) => `/analysis/drilldown?year=${year}${extra}`;

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.budgetAnalysis")} description={`${year} · ${dataset === "approved" ? t("analysis.approvedOnly") : t("analysis.includeProposals")}`} breadcrumbs={[{ label: t("nav.analysis") }, { label: t("nav.budgetAnalysis") }]} />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
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
      <StatGrid>
        <StatCard label={t("dashboard.totalExpenditure")} value={money(totals.expenditure)} href={drill(mdaId ? `&mda=${mdaId}` : "")} />
        <StatCard label={t("dashboard.totalRevenue")} value={money(totals.revenue)} href={drill(`&kind=REVENUE${mdaId ? `&mda=${mdaId}` : ""}`)} />
        <StatCard label={balance >= 0 ? t("analysis.surplus") : t("analysis.deficit")} value={formatMoney(balance, { currencySymbol: settings.currency.symbol, signed: true })} />
        <StatCard label={t("analysis.personnelShare")} value={formatPercent(calculateShare(totals.personnel, totals.expenditure))} hint={money(totals.personnel)} />
        <StatCard label={t("analysis.capitalShare")} value={formatPercent(calculateShare(totals.capital, totals.expenditure))} hint={money(totals.capital)} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BarCard
          title={t("analysis.byCategory")}
          description={t("analysis.drillDown")}
          nameLabel={t("common.category")}
          valueLabel={t("common.amount")}
          data={expenditureCats.map((c) => ({ label: en ? c.name : c.nameSo, value: c.amount, href: c.categoryId ? drill(`${mdaId ? `&mda=${mdaId}` : ""}&category=${c.categoryId}`) : undefined }))}
        />
        {!mdaId ? (
          <BarCard
            title={t("analysis.byMda")}
            description={t("analysis.topMdas")}
            nameLabel={t("common.mda")}
            valueLabel={t("common.amount")}
            labelWidth={170}
            data={mdas.slice(0, 12).map((m) => ({ label: `${m.code} ${en && m.nameEn ? m.nameEn : m.name}`.slice(0, 28), fullLabel: `${m.code} ${en && m.nameEn ? m.nameEn : m.name}`, value: m.expenditure, href: drill(`&mda=${m.mdaId}`) }))}
          />
        ) : null}
        <BarCard title={t("analysis.byEconomic")} nameLabel={t("common.code")} valueLabel={t("common.amount")} data={economic.map((c) => ({ label: `${c.code} ${en && c.nameEn ? c.nameEn : c.name}`.slice(0, 28), fullLabel: `${c.code} ${en && c.nameEn ? c.nameEn : c.name}`, value: c.amount }))} labelWidth={170} />
        {revenueSources.length ? (
          <BarCard title={t("analysis.bySource")} nameLabel={t("common.code")} valueLabel={t("common.amount")} data={revenueSources.map((c) => ({ label: `${c.code} ${en && c.nameEn ? c.nameEn : c.name}`.slice(0, 28), fullLabel: `${c.code} ${en && c.nameEn ? c.nameEn : c.name}`, value: c.amount }))} labelWidth={170} />
        ) : null}
      </div>
      <section className="rounded-lg border bg-card" aria-labelledby="ba-cat">
        <h2 id="ba-cat" className="border-b px-4 py-3 text-sm font-semibold">
          {t("analysis.byCategory")}
        </h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.category")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.type")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.amount")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.share")}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={`${c.kind}-${c.code}`} className="border-b last:border-0 hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {c.categoryId ? (
                      <Link href={drill(`${c.kind === "REVENUE" ? "&kind=REVENUE" : ""}${mdaId ? `&mda=${mdaId}` : ""}&category=${c.categoryId}`)} className="hover:underline">
                        {en ? c.name : c.nameSo}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </th>
                  <td className="px-3 py-2 text-xs">{c.kind === "REVENUE" ? t("budget.revenueKind") : t("budget.expenditureKind")}</td>
                  <td className="num px-3 py-2 text-right">{money(c.amount)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(calculateShare(c.amount, c.kind === "REVENUE" ? totals.revenue : totals.expenditure))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

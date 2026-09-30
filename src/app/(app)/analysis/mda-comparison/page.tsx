import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { calculateGrowthRate, calculateShare, toAmount } from "@/lib/calculations";
import { formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveYear } from "@/lib/page-params";
import { budgetByMda, executionByMda, type Dataset } from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { BarCard } from "../analysis-charts";

export const metadata: Metadata = { title: "MDA comparison" };

type SortKey = "expenditure" | "share" | "growth" | "personnel" | "capital" | "revenue" | "execution";

export default async function MdaComparisonPage(props: PageProps<"/analysis/mda-comparison">) {
  const actor = await requirePagePermission("analysis.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const dataset: Dataset = param(sp, "dataset") === "approved" ? "approved" : "effective";
  const sectorId = param(sp, "sector");
  const sortParam = param(sp, "sort") ?? "expenditure.desc";
  const [sortKey, sortDir] = sortParam.split(".") as [SortKey, "asc" | "desc"];
  const options = await filterOptions(actor, locale);
  const status = options.yearRecords.find((y) => y.year === year)?.status;
  const executing = Boolean(status && ["ACTIVE", "PUBLISHED", "CLOSED"].includes(status));
  const [current, prior, execution] = await Promise.all([
    budgetByMda(actor, year, { dataset, sectorId }),
    budgetByMda(actor, year - 1, { dataset: "approved", sectorId }),
    executing ? executionByMda(actor, year, { sectorId }) : Promise.resolve([]),
  ]);
  const total = toAmount(current.reduce((s, m) => s + m.expenditure, 0));
  const en = locale === "en";
  const rows = current.map((m) => {
    const p = prior.find((x) => x.mdaId === m.mdaId);
    const e = execution.find((x) => x.mdaId === m.mdaId);
    return {
      ...m,
      label: `${m.code} ${en && m.nameEn ? m.nameEn : m.name}`,
      share: calculateShare(m.expenditure, total),
      prior: p?.expenditure ?? null,
      growth: p ? calculateGrowthRate(m.expenditure, p.expenditure) : null,
      personnelPct: calculateShare(m.personnel, m.expenditure),
      capitalPct: calculateShare(m.capital, m.expenditure),
      execution: e?.executionRate ?? null,
    };
  });
  const value = (r: (typeof rows)[number]): number => {
    switch (sortKey) {
      case "share":
        return r.share ?? 0;
      case "growth":
        return r.growth ?? -Infinity;
      case "personnel":
        return r.personnelPct ?? 0;
      case "capital":
        return r.capitalPct ?? 0;
      case "revenue":
        return r.revenue;
      case "execution":
        return r.execution ?? -Infinity;
      default:
        return r.expenditure;
    }
  };
  rows.sort((a, b) => (sortDir === "asc" ? value(a) - value(b) : value(b) - value(a)));
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const q = (extra: Record<string, string>) => `/analysis/mda-comparison?${new URLSearchParams(Object.entries({ year: String(year), dataset: dataset === "approved" ? "approved" : "", sector: sectorId ?? "", ...extra }).filter(([, v]) => v))}`;
  const th = (k: SortKey, label: string) => {
    const active = sortKey === k;
    const next = active && sortDir === "desc" ? "asc" : "desc";
    return (
      <th key={k} scope="col" className="px-3 py-2 text-right font-medium" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <Link href={q({ sort: `${k}.${next}` })} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {active ? sortDir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
        </Link>
      </th>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.mdaComparison")} description={`${year} · ${rows.length} ${t("nav.mdas")}`} breadcrumbs={[{ label: t("nav.analysis") }, { label: t("nav.mdaComparison") }]} />
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
        ]}
      />
      <BarCard
        title={t("analysis.byMda")}
        description={t("analysis.drillDown")}
        nameLabel={t("common.mda")}
        valueLabel={t("dashboard.totalExpenditure")}
        labelWidth={170}
        data={[...rows].sort((a, b) => b.expenditure - a.expenditure).slice(0, 15).map((r) => ({ label: r.label.slice(0, 28), fullLabel: r.label, value: r.expenditure, href: `/analysis/drilldown?year=${year}&mda=${r.mdaId}` }))}
      />
      <section className="rounded-lg border bg-card" aria-label={t("nav.mdaComparison")}>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
                {th("expenditure", t("dashboard.totalExpenditure"))}
                {th("share", t("common.share"))}
                <th scope="col" className="px-3 py-2 text-right font-medium">{`${year - 1}`}</th>
                {th("growth", t("common.growth"))}
                {th("personnel", t("analysis.personnelPct"))}
                {th("capital", t("analysis.capitalPct"))}
                {th("revenue", t("dashboard.totalRevenue"))}
                {executing ? th("execution", t("common.executionRate")) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mdaId} className="border-b last:border-0 hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link href={`/analysis/drilldown?year=${year}&mda=${r.mdaId}`} className="hover:underline">
                      {r.label}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{r.sector}</span>
                  </th>
                  <td className="px-3 py-2">
                    <Link href={`/budget/workspace/${r.submissionId}`}>
                      <StatusBadge status={r.status} />
                    </Link>
                  </td>
                  <td className="num px-3 py-2 text-right">{money(r.expenditure)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(r.share)}</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">{r.prior === null ? "—" : money(r.prior)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(r.growth, 1, { signed: true })}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(r.personnelPct)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(r.capitalPct)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.revenue)}</td>
                  {executing ? <td className="num px-3 py-2 text-right">{formatPercent(r.execution)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

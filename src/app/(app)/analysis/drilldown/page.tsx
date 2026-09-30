import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { requirePagePermission } from "@/lib/auth/session";
import { formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveYear } from "@/lib/page-params";
import { drilldown, type DrillFilters } from "@/lib/services/drilldown";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { BarCard } from "../analysis-charts";

export const metadata: Metadata = { title: "Drill-down analysis" };

export default async function DrilldownPage(props: PageProps<"/analysis/drilldown">) {
  const actor = await requirePagePermission("analysis.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const measure = param(sp, "measure") === "actual" ? "actual" : "budget";
  const year = await resolveYear(sp, measure === "actual" ? "execution" : "preparation");
  const f: DrillFilters = {
    year,
    kind: param(sp, "kind") === "REVENUE" ? "REVENUE" : "EXPENDITURE",
    measure,
    sectorId: param(sp, "sector"),
    mdaId: param(sp, "mda") || (actor.allMdas ? undefined : actor.assignments[0]?.mdaId),
    categoryId: param(sp, "category"),
    codeId: param(sp, "code"),
  };
  const [{ level, rows, total, crumbs }, options] = await Promise.all([drilldown(actor, f), filterOptions(actor, locale)]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });

  const base = { year: String(year), kind: f.kind === "REVENUE" ? "REVENUE" : undefined, measure: measure === "actual" ? "actual" : undefined };
  const href = (p: Record<string, string | undefined>) => `/analysis/drilldown?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`;
  const current = { ...base, sector: f.sectorId, mda: f.mdaId, category: f.categoryId, code: f.codeId };
  const rowHref = (next: Record<string, string> | null) => (next ? href({ ...current, ...next }) : undefined);
  // A breadcrumb keeps the filters above it and drops those below.
  const crumbHref = (i: number) => {
    const keep: Record<string, string | undefined> = { ...base };
    for (const c of crumbs.slice(1, i + 1)) keep[c.key] = c.id ?? undefined;
    return href(keep);
  };
  const levelLabel: Record<string, string> = { sector: t("analysis.bySector"), mda: t("analysis.byMda"), mdaOfCode: t("analysis.byMda"), category: t("analysis.byCategory"), item: t("analysis.byItem"), code: t("analysis.byCode") };
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs hover:bg-muted", active && "border-primary/50 bg-primary/5 font-medium");
  const value = (r: { budget: number; actual: number }) => (measure === "actual" ? r.actual : r.budget);

  return (
    <div className="space-y-5">
      <PageHeader title={t("analysis.drilldownTitle")} description={t("analysis.drillDown")} breadcrumbs={[{ label: t("nav.analysis") }, { label: t("analysis.drilldownTitle") }]} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterBar filters={[{ type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) }]} />
        <nav className="flex gap-1" aria-label={t("common.type")}>
          <Link href={href({ ...current, kind: undefined, category: undefined, code: undefined })} className={chip(f.kind === "EXPENDITURE")}>
            {t("budget.expenditureKind")}
          </Link>
          <Link href={href({ ...current, kind: "REVENUE", category: undefined, code: undefined })} className={chip(f.kind === "REVENUE")}>
            {t("budget.revenueKind")}
          </Link>
        </nav>
        <nav className="flex gap-1" aria-label={t("analysis.measure")}>
          <Link href={href({ ...current, measure: undefined })} className={chip(measure === "budget")}>
            {t("common.budget")}
          </Link>
          <Link href={href({ ...current, measure: "actual" })} className={chip(measure === "actual")}>
            {t("analysis.budgetVsActual")}
          </Link>
        </nav>
      </div>
      <nav aria-label={t("analysis.drillPath")}>
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <li key={`${c.key}-${c.id}`} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
              {i === crumbs.length - 1 ? (
                <span aria-current="page" className="font-medium">
                  {i === 0 ? t("analysis.government") : c.label}
                </span>
              ) : (
                <Link href={crumbHref(i)} className="text-muted-foreground hover:text-foreground hover:underline">
                  {i === 0 ? t("analysis.government") : c.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <StatGrid>
        <StatCard label={measure === "actual" ? t("execution.revisedBudget") : f.kind === "EXPENDITURE" ? t("dashboard.totalExpenditure") : t("dashboard.totalRevenue")} value={money(total.budget)} />
        {measure === "actual" ? (
          <>
            <StatCard label={t("common.actual")} value={money(total.actual)} />
            <StatCard label={f.kind === "EXPENDITURE" ? t("common.executionRate") : t("common.collectionRate")} value={formatPercent(total.rate)} />
          </>
        ) : null}
        <StatCard label={levelLabel[level]} value={String(rows.length)} />
      </StatGrid>
      {rows.length === 0 ? (
        <EmptyState
          title={level === "code" ? t("analysis.noFurtherBreakdown") : t("common.noResults")}
          description={level === "code" ? t("analysis.noFurtherBreakdownHint") : measure === "actual" ? t("execution.noAllocations") : undefined}
          action={
            crumbs.length > 1 ? (
              <Link href={crumbHref(crumbs.length - 2)} className="text-sm underline">
                {t("common.back")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <BarCard
            title={levelLabel[level]}
            description={`${year} · ${measure === "actual" ? t("common.actual") : t("common.budget")}${rows.some((r) => r.next) ? ` · ${t("analysis.drillDown")}` : ""}`}
            nameLabel={t("common.name")}
            valueLabel={measure === "actual" ? t("common.actual") : t("common.budget")}
            labelWidth={170}
            data={rows.slice(0, 15).map((r) => ({ label: `${r.code ? `${r.code} ` : ""}${r.label}`.slice(0, 28), fullLabel: `${r.code ? `${r.code} ` : ""}${r.label}`, value: value(r), href: rowHref(r.next) }))}
          />
          <section className="rounded-lg border bg-card" aria-label={levelLabel[level]}>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="px-3 py-2 text-left font-medium">{levelLabel[level]}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{measure === "actual" ? t("execution.revisedBudget") : t("common.budget")}</th>
                    {measure === "actual" ? (
                      <>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.actual")}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
                      </>
                    ) : null}
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.share")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const link = rowHref(r.next);
                    const label = (
                      <>
                        {r.code ? <span className="num font-medium">{r.code} </span> : null}
                        {r.label}
                        {r.labelAlt ? <span className="block text-xs text-muted-foreground">{r.labelAlt}</span> : null}
                      </>
                    );
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {link ? (
                            <Link href={link} className="hover:underline">
                              {label}
                            </Link>
                          ) : (
                            label
                          )}
                        </th>
                        <td className="num px-3 py-2 text-right">{money(r.budget)}</td>
                        {measure === "actual" ? (
                          <>
                            <td className="num px-3 py-2 text-right">{money(r.actual)}</td>
                            <td className="num px-3 py-2 text-right">{formatPercent(r.rate)}</td>
                          </>
                        ) : null}
                        <td className="num px-3 py-2 text-right">{formatPercent(r.share)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/50 font-semibold">
                    <th scope="row" className="px-3 py-2 text-left">
                      {t("common.total")}
                    </th>
                    <td className="num px-3 py-2 text-right">{money(total.budget)}</td>
                    {measure === "actual" ? (
                      <>
                        <td className="num px-3 py-2 text-right">{money(total.actual)}</td>
                        <td className="num px-3 py-2 text-right">{formatPercent(total.rate)}</td>
                      </>
                    ) : null}
                    <td className="num px-3 py-2 text-right">{formatPercent(100)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

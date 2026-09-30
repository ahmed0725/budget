"use client";

import Link from "next/link";
import { ChartCard } from "@/components/charts/chart-card";
import { DivergingBarChart, GroupedBarChart, HBarChart, TrendChart, type BarDatum } from "@/components/charts/charts";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { useT } from "@/lib/i18n/client";

export function ExecutiveCharts({
  year,
  yoy,
  byMda,
  byCategory,
  bySource,
  monthly,
  quarterly,
  personnel,
  variance,
  projects,
}: {
  year: number;
  yoy: { year: string; expenditure: number; revenue: number }[];
  byMda: BarDatum[];
  byCategory: BarDatum[];
  bySource: BarDatum[];
  monthly: { month: string; planned: number; actual: number | null }[];
  quarterly: { quarter: string; planned: number; actual: number }[];
  personnel: BarDatum[];
  variance: BarDatum[];
  projects: { id: string; name: string; mda: string; allocation: number; totalCost: number; status: string; funding: string; submissionId: string }[];
}) {
  const { t } = useT();
  const fmt = useFormat();
  const m = (v: number | null) => (v === null ? "—" : fmt.money(v));
  const barTable = (rows: BarDatum[], label: string) => ({ columns: [{ label }, { label: t("common.amount"), align: "right" as const }], rows: rows.map((r) => [r.fullLabel ?? r.label, m(r.value)]) });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title={t("dashboard.revenueVsExpenditure")}
        description={t("dashboard.yearOverYear")}
        table={{ columns: [{ label: t("common.year") }, { label: t("dashboard.totalRevenue"), align: "right" }, { label: t("dashboard.totalExpenditure"), align: "right" }], rows: yoy.map((y) => [y.year, m(y.revenue), m(y.expenditure)]) }}
      >
        <GroupedBarChart
          data={yoy}
          xKey="year"
          series={[
            { key: "revenue", label: t("dashboard.totalRevenue") },
            { key: "expenditure", label: t("dashboard.totalExpenditure") },
          ]}
        />
      </ChartCard>
      <ChartCard title={t("dashboard.monthlyExecution")} description={`${year} · ${t("common.planned")} / ${t("common.actual")} (cumulative)`} table={{ columns: [{ label: t("common.month") }, { label: t("common.planned"), align: "right" }, { label: t("common.actual"), align: "right" }], rows: monthly.map((r) => [r.month, m(r.planned), m(r.actual)]) }}>
        <TrendChart
          data={monthly}
          xKey="month"
          series={[
            { key: "planned", label: t("common.planned") },
            { key: "actual", label: t("common.actual") },
          ]}
        />
      </ChartCard>
      <ChartCard title={t("dashboard.budgetByMda")} description={t("analysis.drillDown")} table={barTable(byMda, t("common.mda"))} height={320}>
        <HBarChart data={byMda} name={t("common.budget")} labelWidth={170} />
      </ChartCard>
      <ChartCard title={t("dashboard.budgetByClassification")} description={t("analysis.drillDown")} table={barTable(byCategory, t("common.category"))} height={320}>
        <HBarChart data={byCategory} name={t("common.budget")} labelWidth={170} />
      </ChartCard>
      <ChartCard title={t("dashboard.revenueBySource")} table={barTable(bySource, t("forms.revenueSource"))}>
        <HBarChart data={bySource} name={t("dashboard.totalRevenue")} labelWidth={170} />
      </ChartCard>
      <ChartCard
        title={t("dashboard.quarterlyExecution")}
        description={`${year}`}
        table={{ columns: [{ label: t("common.quarter") }, { label: t("common.planned"), align: "right" }, { label: t("common.actual"), align: "right" }], rows: quarterly.map((q) => [q.quarter, m(q.planned), m(q.actual)]) }}
      >
        <GroupedBarChart
          data={quarterly}
          xKey="quarter"
          series={[
            { key: "planned", label: t("common.planned") },
            { key: "actual", label: t("common.actual") },
          ]}
        />
      </ChartCard>
      <ChartCard title={t("dashboard.personnelExpenditure")} table={barTable(personnel, t("common.mda"))} height={300}>
        <HBarChart data={personnel} name={t("nav.personnel")} labelWidth={170} />
      </ChartCard>
      <ChartCard title={t("dashboard.budgetVariance")} description={`${t("common.planned")} − ${t("common.actual")} (${t("dashboard.actualToDate").toLowerCase()})`} table={barTable(variance, t("common.mda"))} height={300}>
        <DivergingBarChart data={variance} name={t("common.variance")} labelWidth={60} />
      </ChartCard>
      <section className="rounded-lg border bg-card xl:col-span-2" aria-labelledby="projects-title">
        <header className="flex items-center justify-between px-4 pt-3">
          <h3 id="projects-title" className="text-sm font-semibold">
            {t("dashboard.majorProjects")}
          </h3>
          <Link href="/budget/capital-projects" className="text-xs text-primary hover:underline">
            {t("dashboard.viewAll")}
          </Link>
        </header>
        <div className="relative overflow-x-auto p-2">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-2 py-1.5 text-left font-medium">{t("forms.projectName")}</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("forms.totalProjectCost")}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("common.budget")}</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">{t("forms.fundingSource")}</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <Link href={`/budget/workspace/${p.submissionId}/f`} className="hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="num px-2 py-1.5">{p.mda}</td>
                  <td className="num px-2 py-1.5 text-right">{m(p.totalCost)}</td>
                  <td className="num px-2 py-1.5 text-right">{m(p.allocation)}</td>
                  <td className="px-2 py-1.5">{p.funding}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("common.noResults")}</p> : null}
        </div>
      </section>
    </div>
  );
}

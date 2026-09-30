import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { requirePagePermission } from "@/lib/auth/session";
import { calculateChange, calculatePercent, toAmount } from "@/lib/calculations";
import { formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveYear } from "@/lib/page-params";
import { budgetByCategory, budgetByMda, executionByMda } from "@/lib/services/analytics";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { DivergingCard } from "../analysis-charts";

export const metadata: Metadata = { title: "Variance analysis" };

interface Row {
  id: string;
  label: string;
  href?: string;
  base: number;
  compare: number;
  change: number;
  percent: number | null;
  extra?: { budget: number; rate: number | null };
}

export default async function VariancePage(props: PageProps<"/analysis/variance">) {
  const actor = await requirePagePermission("analysis.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const options = await filterOptions(actor, locale);
  const requestedMode = param(sp, "mode");
  const mode = requestedMode === "proposal" || requestedMode === "execution" ? requestedMode : null;
  const year = await resolveYear(sp, mode === "proposal" ? "preparation" : "execution");
  const yearStatus = options.yearRecords.find((y) => y.year === year)?.status;
  const effectiveMode = mode ?? (yearStatus && ["ACTIVE", "PUBLISHED", "CLOSED"].includes(yearStatus) ? "execution" : "proposal");
  const sectorId = param(sp, "sector");
  const threshold = settings.budget.largeVariancePercent;
  const en = locale === "en";
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const signed = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol, signed: true });

  let rows: Row[] = [];
  let categoryRows: Row[] = [];
  let notSubmitted: string[] = [];
  if (effectiveMode === "proposal") {
    const [current, prior] = await Promise.all([budgetByMda(actor, year, { sectorId }), budgetByMda(actor, year - 1, { sectorId, dataset: "approved" })]);
    // Only MDAs with a budget for the year are compared; the others have not submitted yet.
    const compared = current.map((m) => m.mdaId);
    notSubmitted = prior.filter((p) => !compared.includes(p.mdaId)).map((p) => `${p.code} ${en && p.nameEn ? p.nameEn : p.name}`);
    const [catNow, catPrior] = await Promise.all([
      budgetByCategory(actor, year, { sectorId, kind: "EXPENDITURE", mdaIds: compared }),
      budgetByCategory(actor, year - 1, { sectorId, kind: "EXPENDITURE", dataset: "approved", mdaIds: compared }),
    ]);
    rows = compared.map((id) => {
      const c = current.find((m) => m.mdaId === id);
      const p = prior.find((m) => m.mdaId === id);
      const m = (c ?? p)!;
      const ch = calculateChange(c?.expenditure ?? 0, p?.expenditure ?? 0);
      return { id, label: `${m.code} ${en && m.nameEn ? m.nameEn : m.name}`, href: c ? `/budget/workspace/${c.submissionId}` : undefined, base: p?.expenditure ?? 0, compare: c?.expenditure ?? 0, change: ch.amount, percent: ch.percent };
    });
    const catIds = new Set([...catNow, ...catPrior].map((c) => c.code));
    categoryRows = [...catIds].map((code) => {
      const c = catNow.find((x) => x.code === code);
      const p = catPrior.find((x) => x.code === code);
      const ch = calculateChange(c?.amount ?? 0, p?.amount ?? 0);
      const src = (c ?? p)!;
      return { id: code, label: en ? src.name : src.nameSo, base: p?.amount ?? 0, compare: c?.amount ?? 0, change: ch.amount, percent: ch.percent };
    });
  } else {
    const exec = await executionByMda(actor, year, { sectorId });
    rows = exec.map((m) => {
      const diff = toAmount(m.actual - m.plannedToDate);
      return { id: m.mdaId, label: `${m.code} ${en && m.nameEn ? m.nameEn : m.name}`, href: `/execution/expenditure?year=${year}&mda=${m.mdaId}`, base: m.plannedToDate, compare: m.actual, change: diff, percent: calculatePercent(diff, m.plannedToDate), extra: { budget: m.budget, rate: m.executionRate } };
    });
  }
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const flagged = rows.filter((r) => r.percent !== null && Math.abs(r.percent) > threshold);
  const totalBase = toAmount(rows.reduce((s, r) => s + r.base, 0));
  const totalCompare = toAmount(rows.reduce((s, r) => s + r.compare, 0));
  const totalChange = calculateChange(totalCompare, totalBase);
  const labels = effectiveMode === "proposal" ? { base: `${year - 1} ${t("common.approvedShort")}`, compare: `${year} ${t("common.proposedShort")}` } : { base: t("analysis.plannedToDate"), compare: t("analysis.actualToDate") };
  const modeHref = (m: string) => `/analysis/variance?mode=${m}${sectorId ? `&sector=${sectorId}` : ""}`;
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs hover:bg-muted", active && "border-primary/50 bg-primary/5 font-medium");

  const table = (list: Row[], title: string, id: string, withExtra: boolean) => (
    <section className="rounded-lg border bg-card" aria-labelledby={id}>
      <h2 id={id} className="border-b px-4 py-3 text-sm font-semibold">
        {title}
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.name")}</th>
              {withExtra ? <th scope="col" className="px-3 py-2 text-right font-medium">{t("execution.revisedBudget")}</th> : null}
              <th scope="col" className="px-3 py-2 text-right font-medium">{labels.base}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{labels.compare}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.variance")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.variancePercent")}</th>
              {withExtra ? <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.executionRate")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const large = r.percent !== null && Math.abs(r.percent) > threshold;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {r.href ? (
                      <Link href={r.href} className="hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </th>
                  {withExtra ? <td className="num px-3 py-2 text-right">{money(r.extra?.budget ?? 0)}</td> : null}
                  <td className="num px-3 py-2 text-right">{money(r.base)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.compare)}</td>
                  <td className="num px-3 py-2 text-right">{signed(r.change)}</td>
                  <td className={cn("num px-3 py-2 text-right", large && "font-semibold")}>
                    {large ? <AlertTriangle className="mr-1 inline size-3.5 text-warning" aria-label={t("analysis.largeVariance")} /> : null}
                    {r.base === 0 && r.compare !== 0 ? t("analysis.new") : formatPercent(r.percent, 1, { signed: true })}
                  </td>
                  {withExtra ? <td className="num px-3 py-2 text-right">{formatPercent(r.extra?.rate ?? null)}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.varianceAnalysis")}
        description={effectiveMode === "proposal" ? t("analysis.proposalVarianceHint", { year, prior: year - 1 }) : t("analysis.executionVarianceHint", { year })}
        breadcrumbs={[{ label: t("nav.analysis") }, { label: t("nav.varianceAnalysis") }]}
      />
      <div className="flex flex-wrap items-end gap-3">
        <FilterBar
          filters={[
            { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
            ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" }] : []),
          ]}
        />
        <nav className="flex gap-1" aria-label={t("analysis.compare")}>
          <Link href={modeHref("proposal")} className={chip(effectiveMode === "proposal")} aria-current={effectiveMode === "proposal" ? "true" : undefined}>
            {t("analysis.proposalVsPrior")}
          </Link>
          <Link href={modeHref("execution")} className={chip(effectiveMode === "execution")} aria-current={effectiveMode === "execution" ? "true" : undefined}>
            {t("analysis.budgetVsActual")}
          </Link>
        </nav>
      </div>
      <StatGrid>
        <StatCard label={labels.base} value={money(totalBase)} />
        <StatCard label={labels.compare} value={money(totalCompare)} />
        <StatCard label={t("common.variance")} value={signed(totalChange.amount)} hint={formatPercent(totalChange.percent, 1, { signed: true })} />
        <StatCard label={t("analysis.largeVariance")} value={String(flagged.length)} hint={t("analysis.thresholdHint", { threshold })} />
      </StatGrid>
      {notSubmitted.length ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{t("analysis.notSubmitted", { count: notSubmitted.length, year })}</span> <span className="text-muted-foreground">{notSubmitted.join(", ")}</span>
        </p>
      ) : null}
      <DivergingCard
        title={effectiveMode === "proposal" ? t("analysis.changeByMda") : t("analysis.overUnderByMda")}
        description={effectiveMode === "proposal" ? `${labels.compare} − ${labels.base}` : t("analysis.overUnderHint")}
        nameLabel={t("common.mda")}
        valueLabel={t("common.variance")}
        data={rows.slice(0, 15).map((r) => ({ label: r.label.slice(0, 22), fullLabel: r.label, value: r.change, href: r.href }))}
      />
      {table(rows, t("analysis.byMda"), "var-mda", effectiveMode === "execution")}
      {categoryRows.length ? table(categoryRows, t("analysis.byCategory"), "var-cat", false) : null}
    </div>
  );
}

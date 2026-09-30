import { Banknote, Building2, Clock, Coins, Gauge, HandCoins, Hourglass, Landmark, Scale, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import type { Actor } from "@/lib/auth/actor";
import { calculateVariance, QUARTERS } from "@/lib/calculations";
import { formatMoney, formatPercent, MONTH_NAMES } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { budgetByCategory, budgetByCodeLevel, budgetByMda, executionByMda, executionSummary, expenditureMonthly, submissionProgress, topProjects, yearTotals } from "@/lib/services/analytics";
import { getSettings } from "@/lib/services/settings";
import { ExecutiveCharts } from "./executive-charts";

export async function ExecutiveSection({ actor, executionYear, preparationYear }: { actor: Actor; executionYear: number; preparationYear?: number }) {
  const { t, locale } = await getT();
  const settings = await getSettings();
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol, compact: true });
  const years = [executionYear - 2, executionYear - 1, executionYear, ...(preparationYear && preparationYear > executionYear ? [preparationYear] : [])];

  const [totals, byMda, byCategory, bySource, exec, monthly, execByMda, progress, projects] = await Promise.all([
    yearTotals(actor, years),
    budgetByMda(actor, executionYear),
    budgetByCategory(actor, executionYear, { kind: "EXPENDITURE" }),
    budgetByCodeLevel(actor, executionYear, "REVENUE", 2),
    executionSummary(actor, executionYear),
    expenditureMonthly(actor, executionYear),
    executionByMda(actor, executionYear),
    preparationYear ? submissionProgress(actor, preparationYear) : Promise.resolve(null),
    topProjects(actor, preparationYear ?? executionYear, 6),
  ]);
  const current = totals.find((y) => y.year === executionYear)!;
  const previous = totals.find((y) => y.year === executionYear - 1);
  const growth = previous && previous.expenditure ? ((current.expenditure - previous.expenditure) / previous.expenditure) * 100 : null;
  const balance = exec.revenueTarget - exec.revisedBudget;
  const name = (m: { name: string; nameEn: string | null; code: string }) => `${m.code} ${locale === "en" && m.nameEn ? m.nameEn : m.name}`;
  const lastMonth = exec.lastActualMonth;

  return (
    <section aria-labelledby="exec-title" className="space-y-4">
      <h2 id="exec-title" className="text-sm font-semibold">
        {t("nav.executive")} — {executionYear}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label={t("dashboard.totalBudget")}
          value={money(exec.revisedBudget || current.expenditure)}
          icon={Landmark}
          href={`/analysis/drilldown?year=${executionYear}`}
          delta={growth !== null ? { text: `${formatPercent(growth, 1, { signed: true })} vs ${executionYear - 1}`, direction: growth > 0 ? "up" : growth < 0 ? "down" : "flat" } : undefined}
        />
        <StatCard label={t("dashboard.totalRevenue")} value={money(exec.revenueTarget || current.revenue)} icon={Coins} href={`/execution/revenue?year=${executionYear}`} hint={`${t("common.actual")}: ${money(exec.revenueActual)}`} />
        <StatCard label={t("dashboard.totalExpenditure")} value={money(exec.actual)} icon={Banknote} href={`/analysis/drilldown?year=${executionYear}&measure=actual`} hint={lastMonth ? `${t("dashboard.actualToDate")} (${MONTH_NAMES[locale][0]}–${MONTH_NAMES[locale][lastMonth - 1]})` : undefined} />
        <StatCard
          label={t("dashboard.budgetBalance")}
          value={money(balance)}
          icon={Scale}
          delta={{ text: balance >= 0 ? t("common.approvedShort") : t("common.variance"), direction: balance >= 0 ? "up" : "down", good: balance >= 0 }}
          hint={`${t("dashboard.totalRevenue")} − ${t("dashboard.totalBudget")}`}
        />
        <StatCard label={t("dashboard.executionRate")} value={formatPercent(exec.executionRate)} icon={Gauge} href={`/execution/expenditure?year=${executionYear}`} hint={`${money(exec.actual)} / ${money(exec.revisedBudget)}`} />
        <StatCard label={t("dashboard.collectionRate")} value={formatPercent(exec.collectionRate)} icon={HandCoins} href={`/execution/revenue?year=${executionYear}`} hint={`${money(exec.revenueActual)} / ${money(exec.revenueTarget)}`} />
        <StatCard label={t("dashboard.capitalBudget")} value={money(preparationYear ? totals.find((y) => y.year === preparationYear)?.capital ?? current.capital : current.capital)} icon={TrendingUp} href="/budget/capital-projects" hint={preparationYear ? `${preparationYear}` : `${executionYear}`} />
        <StatCard label={t("dashboard.mdaCount")} value={String(current.mdas)} icon={Building2} href={`/analysis/mda-comparison?year=${executionYear}`} />
        {progress ? <StatCard label={t("dashboard.pendingSubmissions")} value={String(progress.submitted + progress.inReview)} icon={Clock} href={`/submissions/pending?year=${preparationYear}`} hint={`${progress.notStarted + progress.draft} ${t("status.DRAFT").toLowerCase()} / ${t("dashboard.notStarted").toLowerCase()}`} /> : null}
        {progress ? <StatCard label={t("dashboard.awaitingApproval")} value={String(progress.awaitingApproval)} icon={Hourglass} href={`/submissions/under-review?year=${preparationYear}`} hint={`${progress.approved} ${t("status.APPROVED").toLowerCase()}`} /> : null}
      </div>

      <ExecutiveCharts
        year={executionYear}
        yoy={totals.map((y) => ({ year: String(y.year), expenditure: y.expenditure, revenue: y.revenue }))}
        byMda={byMda.slice(0, 10).map((m) => ({ label: name(m).slice(0, 26), fullLabel: name(m), value: m.expenditure, href: `/analysis/drilldown?year=${executionYear}&mda=${m.mdaId}` }))}
        byCategory={byCategory.map((c) => ({ label: locale === "so" ? c.nameSo : c.name, value: c.amount, href: c.categoryId ? `/analysis/drilldown?year=${executionYear}&category=${c.categoryId}` : undefined }))}
        bySource={bySource.map((s) => ({ label: `${s.code} ${locale === "en" && s.nameEn ? s.nameEn : s.name}`, value: s.amount }))}
        monthly={monthly.map((m) => ({ month: MONTH_NAMES[locale][m.month - 1], planned: m.cumulativePlanned, actual: m.month <= lastMonth ? m.cumulativeActual : null }))}
        quarterly={QUARTERS.map((q, i) => ({
          quarter: q,
          planned: monthly.slice(i * 3, i * 3 + 3).reduce((a, m) => a + m.planned, 0),
          actual: monthly.slice(i * 3, i * 3 + 3).reduce((a, m) => a + m.actual, 0),
        }))}
        personnel={byMda
          .filter((m) => m.personnel > 0)
          .sort((a, b) => b.personnel - a.personnel)
          .slice(0, 8)
          .map((m) => ({ label: name(m).slice(0, 26), fullLabel: name(m), value: m.personnel }))}
        variance={execByMda
          .filter((m) => m.plannedToDate > 0)
          .map((m) => ({ label: m.code, fullLabel: name(m), value: calculateVariance(m.plannedToDate, m.actual).amount, href: `/execution/expenditure?year=${executionYear}&mda=${m.mdaId}` }))
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          .slice(0, 10)}
        projects={projects}
      />
    </section>
  );
}

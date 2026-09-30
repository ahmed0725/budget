import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { YearTimeline } from "@/components/budget/year-timeline";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { daysUntil, isoDay, YEAR_DATE_FIELDS, yearPhases } from "@/lib/budget-years";
import { prisma } from "@/lib/db";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { allowedYearTransitions } from "@/lib/services/admin";
import { getSettings } from "@/lib/services/settings";
import { YearFormDialog, YearStatusControl, type YearFormValues } from "./year-admin";

export const metadata: Metadata = { title: "Budget years" };

export default async function BudgetYearsAdminPage() {
  const actor = await requirePagePermission("admin.years.manage");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const [years, counts, totals] = await Promise.all([
    prisma.budgetYear.findMany({ orderBy: { year: "desc" } }),
    prisma.budgetSubmission.groupBy({ by: ["budgetYearId", "status"], where: { type: "ORIGINAL", supersededAt: null }, _count: { _all: true } }),
    prisma.budgetSubmission.groupBy({ by: ["budgetYearId"], where: { status: { in: ["APPROVED", "PUBLISHED"] }, supersededAt: null }, _sum: { totalExpenditure: true, totalRevenue: true } }),
  ]);
  const countsOf = (id: string) => counts.filter((c) => c.budgetYearId === id);
  const totalOf = (id: string) => totals.find((c) => c.budgetYearId === id)?._sum;

  const values = (y: (typeof years)[number]): YearFormValues => {
    const v: Record<string, unknown> = { year: y.year, name: y.name, notes: y.notes ?? "" };
    for (const f of YEAR_DATE_FIELDS) v[f] = isoDay(y[f]);
    return v as YearFormValues;
  };

  return (
    <div>
      <PageHeader
        title={t("nav.budgetYears")}
        description={t("admin.timeline")}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.budgetYears") }]}
        actions={<YearFormDialog suggestedYear={(years[0]?.year ?? new Date().getUTCFullYear()) + 1} />}
      />
      {years.length === 0 ? <EmptyState icon={CalendarRange} title={t("admin.noYears")} /> : null}
      <div className="space-y-4">
        {years.map((y) => {
          const c = countsOf(y.id);
          const total = c.reduce((s, x) => s + x._count._all, 0);
          const sums = totalOf(y.id);
          const deadline = y.submissionDeadline && ["DRAFT", "PREPARATION"].includes(y.status) ? daysUntil(y.submissionDeadline) : null;
          return (
            <section key={y.id} className="rounded-lg border bg-card" aria-labelledby={`y-${y.year}`}>
              <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`y-${y.year}`} className="num text-lg font-semibold">
                    {y.year}
                  </h2>
                  <span className="text-sm text-muted-foreground">{y.name}</span>
                  <StatusBadge status={y.status} />
                  {deadline !== null ? (
                    <span className={deadline < 0 ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                      {t("admin.submissionDeadline")}: {formatCalendarDate(y.submissionDeadline, { locale })} · {deadline < 0 ? t("admin.overdue", { days: -deadline }) : t("admin.daysLeft", { days: deadline })}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <YearFormDialog yearId={y.id} defaults={values(y)} />
                  <YearStatusControl yearId={y.id} year={y.year} status={y.status} allowed={allowedYearTransitions(y.status).filter((s) => s !== "PUBLISHED" || can(actor, "budget.publish"))} />
                </div>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_20rem]">
                <div className="space-y-3">
                  <YearTimeline phases={yearPhases(y, t, locale)} currentLabel={t("admin.current")} />
                  <p className="text-xs text-muted-foreground">
                    {t("admin.startDate")}: <span className="num">{formatCalendarDate(y.startDate, { locale })}</span> · {t("admin.endDate")}: <span className="num">{formatCalendarDate(y.endDate, { locale })}</span>
                    {y.notes ? ` · ${y.notes}` : ""}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <h3 className="text-xs font-medium text-muted-foreground">{t("admin.budgetsByStatus")}</h3>
                  {total === 0 ? <p className="text-muted-foreground">—</p> : null}
                  <ul className="flex flex-wrap gap-1.5">
                    {c.map((x) => (
                      <li key={x.status}>
                        <Link href={`/budget/submissions?year=${y.year}&status=${x.status}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
                          {t(`status.${x.status}`)} <span className="num font-semibold">{x._count._all}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {sums?.totalExpenditure ? (
                    <dl className="grid grid-cols-2 gap-x-2 text-xs">
                      <dt className="text-muted-foreground">{t("dashboard.totalExpenditure")}</dt>
                      <dd className="num text-right">{formatMoney(Number(sums.totalExpenditure), { currencySymbol: settings.currency.symbol })}</dd>
                      <dt className="text-muted-foreground">{t("dashboard.totalRevenue")}</dt>
                      <dd className="num text-right">{formatMoney(Number(sums.totalRevenue), { currencySymbol: settings.currency.symbol })}</dd>
                    </dl>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

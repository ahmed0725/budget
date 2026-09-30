import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { CreateBudgetDialog } from "@/components/budget/create-budget-dialog";
import { YearTimeline } from "@/components/budget/year-timeline";
import { Button } from "@/components/ui/button";
import { can, mdaScope, visibleStatuses } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { daysUntil, yearPhases } from "@/lib/budget-years";
import { prisma } from "@/lib/db";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { creatableMdas } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Budget years" };

export default async function BudgetYearsPage() {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const scope = mdaScope(actor);
  const statuses = visibleStatuses(actor);
  const years = await prisma.budgetYear.findMany({ where: actor.approvedOnly ? { status: { in: ["APPROVED", "PUBLISHED", "ACTIVE", "CLOSED"] } } : undefined, orderBy: { year: "desc" } });
  const submissions = await prisma.budgetSubmission.findMany({
    where: { supersededAt: null, ...(scope ? { mdaId: scope } : {}), ...(statuses ? { status: { in: statuses } } : {}) },
    select: { id: true, budgetYearId: true, status: true, type: true, revisionNumber: true, totalExpenditure: true, totalRevenue: true, mda: { select: { code: true, name: true, nameEn: true } } },
    orderBy: [{ mda: { code: "asc" } }, { revisionNumber: "asc" }],
  });
  const creatableByYear = new Map<string, { id: string; label: string }[]>();
  if (can(actor, "budget.prepare")) {
    for (const y of years.filter((y) => y.status === "PREPARATION" || y.status === "DRAFT")) creatableByYear.set(y.id, await creatableMdas(actor, y.id, locale));
  }
  const money = (v: unknown) => formatMoney(Number(v), { currencySymbol: settings.currency.symbol });
  const perAgency = !actor.allMdas;

  return (
    <div>
      <PageHeader title={t("nav.budgetYears")} description={t("admin.timeline")} breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.budgetYears") }]} />
      {years.length === 0 ? <EmptyState icon={CalendarRange} title={t("admin.noYears")} /> : null}
      <div className="space-y-4">
        {years.map((y) => {
          const subs = submissions.filter((s) => s.budgetYearId === y.id);
          const originals = subs.filter((s) => s.type === "ORIGINAL");
          const approved = subs.filter((s) => s.status === "APPROVED" || s.status === "PUBLISHED");
          const totalExp = approved.reduce((sum, s) => sum + Number(s.totalExpenditure), 0);
          const creatable = creatableByYear.get(y.id) ?? [];
          const deadline = y.submissionDeadline && (y.status === "PREPARATION" || y.status === "DRAFT") ? daysUntil(y.submissionDeadline) : null;
          return (
            <section key={y.id} className="rounded-lg border bg-card" aria-labelledby={`by-${y.year}`}>
              <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`by-${y.year}`} className="num text-lg font-semibold">
                    {y.year}
                  </h2>
                  <StatusBadge status={y.status} />
                  {deadline !== null ? (
                    <span className={deadline < 0 ? "text-xs font-medium text-destructive" : deadline <= 14 ? "text-xs font-semibold text-foreground" : "text-xs text-muted-foreground"}>
                      {t("admin.submissionDeadline")}: {formatCalendarDate(y.submissionDeadline, { locale })} · {deadline < 0 ? t("admin.overdue", { days: -deadline }) : t("admin.daysLeft", { days: deadline })}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {creatable.length ? <CreateBudgetDialog year={{ id: y.id, year: y.year }} mdas={creatable} /> : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/budget/submissions?year=${y.year}`}>
                      {t("budget.submissions")}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <YearTimeline phases={yearPhases(y, t, locale)} currentLabel={t("admin.current")} />
                {perAgency && subs.length ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {subs.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <Link href={`/budget/workspace/${s.id}`} className="font-medium hover:underline">
                          <span className="num">{s.mda.code}</span> {locale === "en" && s.mda.nameEn ? s.mda.nameEn : s.mda.name}
                          {s.type === "REVISION" ? <span className="text-muted-foreground"> · {t("budget.revision")} {s.revisionNumber}</span> : null}
                        </Link>
                        <span className="flex items-center gap-3">
                          <span className="num text-muted-foreground">{money(s.totalExpenditure)}</span>
                          <StatusBadge status={s.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {perAgency && !subs.length ? <p className="text-sm text-muted-foreground">{t("budget.noSubmission")}</p> : null}
                {!perAgency ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("budget.submissions")}</dt>
                      <dd className="num text-base font-semibold">{originals.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("status.APPROVED")}</dt>
                      <dd className="num text-base font-semibold">{approved.filter((s) => s.type === "ORIGINAL").length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("budget.revision")}</dt>
                      <dd className="num text-base font-semibold">{subs.length - originals.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("dashboard.totalExpenditure")} ({t("common.approvedShort")})</dt>
                      <dd className="num text-base font-semibold">{money(totalExp)}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { daysUntil } from "@/lib/budget-years";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { CreateBudgetDialog } from "@/components/budget/create-budget-dialog";
import { Button } from "@/components/ui/button";
import { isAgencyMember, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { formatCalendarDate, formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { executionSummary } from "@/lib/services/analytics";
import { creatableMdas } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { loadSubmissionBundle } from "@/lib/services/submission-data";
import { cn } from "@/lib/utils";

const FORMS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export async function AgencySection({ actor, preparationYear, executionYear }: { actor: Actor; preparationYear: number; executionYear: number }) {
  const { t, locale } = await getT();
  const settings = await getSettings();
  const mdaIds = [...new Set(actor.assignments.filter((a) => isAgencyMember(actor, a.mdaId)).map((a) => a.mdaId))];
  const year = await prisma.budgetYear.findUnique({ where: { year: preparationYear } });
  const submissions = await prisma.budgetSubmission.findMany({
    where: { mdaId: { in: mdaIds }, budgetYear: { year: preparationYear } },
    orderBy: [{ mda: { code: "asc" } }, { revisionNumber: "asc" }],
    select: { id: true },
  });
  const bundles = await Promise.all(submissions.map((s) => loadSubmissionBundle(prisma, s.id, { locale })));
  const openCorrections = await prisma.correctionItem.groupBy({ by: ["submissionId"], where: { submissionId: { in: submissions.map((s) => s.id) }, status: { in: ["OPEN", "REOPENED"] } }, _count: { _all: true } });
  const creatable = year ? await creatableMdas(actor, year.id, locale) : [];
  const execs = await Promise.all(mdaIds.map(async (mdaId) => ({ mdaId, exec: await executionSummary(actor, executionYear, { mdaId }) })));
  const mdas = await prisma.mda.findMany({ where: { id: { in: mdaIds } }, select: { id: true, code: true, name: true, nameEn: true } });
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const deadline = year?.submissionDeadline;
  const daysLeft = deadline ? daysUntil(deadline) : null;

  return (
    <section aria-labelledby="agency-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="agency-title" className="text-sm font-semibold">
          {t("dashboard.myBudget")} — {preparationYear}
        </h2>
        {deadline ? (
          <span className={cn("inline-flex items-center gap-1.5 text-sm", daysLeft !== null && daysLeft <= 7 ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
            <CalendarClock className="size-4" aria-hidden />
            {t("dashboard.deadline")}: {formatCalendarDate(deadline, { locale })} · {daysLeft !== null && daysLeft < 0 ? t("dashboard.overdue", { days: -daysLeft }) : t("dashboard.daysLeft", { days: daysLeft ?? 0 })}
          </span>
        ) : null}
      </div>

      {bundles.length === 0 && creatable.length === 0 ? <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{t("budget.noSubmission")}</p> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {bundles.map((b) => {
          const s = b.submission;
          const corrections = openCorrections.find((c) => c.submissionId === s.id)?._count._all ?? 0;
          return (
            <article key={s.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {s.mda.code} — {locale === "en" && s.mda.nameEn ? s.mda.nameEn : s.mda.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.type === "REVISION" ? `${t("budget.revision")} ${s.revisionNumber}` : t("status.ORIGINAL")}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("dashboard.totalBudget")}</dt>
                  <dd className="font-semibold">{money(b.summary.totals.expenditure)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("budget.completion")}</dt>
                  <dd className="font-semibold">{b.overallCompletion}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("budget.validation")}</dt>
                  <dd className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {b.tally.passed}
                    </span>
                    <span className={cn("inline-flex items-center gap-0.5", b.tally.warnings ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
                      <AlertTriangle className="size-3.5" aria-hidden />
                      {b.tally.warnings}
                    </span>
                    <span className={cn("inline-flex items-center gap-0.5", b.tally.errors ? "text-destructive" : "text-muted-foreground")}>
                      <XCircle className="size-3.5" aria-hidden />
                      {b.tally.errors}
                    </span>
                  </dd>
                </div>
              </dl>
              <ol className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8" aria-label={t("dashboard.formCompletion")}>
                {FORMS.map((f) => (
                  <li key={f}>
                    <Link href={`/budget/workspace/${s.id}/${f.toLowerCase()}`} className="block rounded-md border px-2 py-1 text-center text-xs hover:bg-muted">
                      <span className="font-semibold">{f}</span>
                      <span className={cn("block num", b.completion[f] >= 100 ? "text-success" : "text-muted-foreground")}>{b.completion[f] >= 100 ? "✓" : `${b.completion[f]}%`}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              {corrections ? (
                <p className="mt-3 flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-sm">
                  <RotateCcw className="size-4" aria-hidden />
                  {t("dashboard.returnedCorrections")}: {corrections}
                </p>
              ) : null}
              <div className="mt-3 flex justify-end">
                <Button size="sm" asChild>
                  <Link href={`/budget/workspace/${s.id}`}>
                    {t("common.open")}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </article>
          );
        })}
        {year && creatable.length ? (
          <article className="flex flex-col items-start justify-center gap-3 rounded-lg border border-dashed bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("budget.noSubmission")}</p>
            <CreateBudgetDialog year={{ id: year.id, year: preparationYear }} mdas={creatable} />
          </article>
        ) : null}
      </div>

      {execs.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {execs.map(({ mdaId, exec }) => {
            const mda = mdas.find((x) => x.id === mdaId);
            return (
              <article key={mdaId} className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">
                  {t("execution.title")} {executionYear} — {mda?.code}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("execution.revisedBudget")}</dt>
                    <dd className="font-medium">{money(exec.revisedBudget)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("common.actual")}</dt>
                    <dd className="font-medium">{money(exec.actual)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("common.available")}</dt>
                    <dd className="font-medium">{money(exec.available)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("common.executionRate")}</dt>
                    <dd className="font-medium">{formatPercent(exec.executionRate)}</dd>
                  </div>
                </dl>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/15" role="meter" aria-label={t("common.executionRate")} aria-valuenow={exec.executionRate ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, exec.executionRate ?? 0)}%` }} />
                </div>
                <Link href={`/execution/expenditure?year=${executionYear}&mda=${mdaId}`} className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {t("nav.expenditureExecution")}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

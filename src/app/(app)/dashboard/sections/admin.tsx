import Link from "next/link";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import type { Actor } from "@/lib/auth/actor";
import { mdaScope } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { submissionProgress } from "@/lib/services/analytics";
import { getSettings } from "@/lib/services/settings";

/** Budget administrator / director: preparation progress and MDA submission status. */
export async function AdminSection({ actor, year }: { actor: Actor; year: number }) {
  const { t, locale } = await getT();
  const settings = await getSettings();
  const progress = await submissionProgress(actor, year);
  const scope = mdaScope(actor);
  const mdas = await prisma.mda.findMany({
    where: { isActive: true, deletedAt: null, ...(scope ? { id: scope } : {}) },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      nameEn: true,
      submissions: {
        where: { budgetYear: { year }, type: "ORIGINAL" },
        select: { id: true, status: true, completion: true, validationErrors: true, totalExpenditure: true, submittedAt: true },
      },
    },
  });
  const pct = progress.mdas ? Math.round(((progress.submitted + progress.inReview + progress.approved) / progress.mdas) * 100) : 0;
  return (
    <section aria-labelledby="admin-title" className="space-y-3">
      <h2 id="admin-title" className="text-sm font-semibold">
        {t("dashboard.preparationProgress")} — {year}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.submissionStatus")} value={`${pct}%`} hint={`${progress.submitted + progress.inReview + progress.approved} / ${progress.mdas} ${t("nav.mdas")}`}>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/15">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </StatCard>
        <StatCard label={t("dashboard.pendingReviews")} value={String(progress.submitted + progress.inReview)} href={`/submissions/pending?year=${year}`} hint={`${progress.awaitingApproval} ${t("dashboard.awaitingApproval").toLowerCase()}`} />
        <StatCard label={t("nav.returned")} value={String(progress.returned)} href={`/submissions/returned?year=${year}`} hint={`${progress.draft} ${t("status.DRAFT").toLowerCase()} · ${progress.notStarted} ${t("dashboard.notStarted").toLowerCase()}`} />
        <StatCard label={t("dashboard.validationErrors")} value={String(progress.validationErrors)} href={`/budget/submissions?year=${year}&sort=validation.desc`} hint={`${t("budget.completion")}: ${progress.averageCompletion}%`} />
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("dashboard.submissionStatus")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.completion")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("dashboard.validationErrors")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("dashboard.totalBudget")}</th>
            </tr>
          </thead>
          <tbody>
            {mdas.map((m) => {
              const s = m.submissions[0];
              return (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    {s ? (
                      <Link href={`/budget/workspace/${s.id}`} className="hover:underline">
                        <span className="num font-medium">{m.code}</span> — {locale === "en" && m.nameEn ? m.nameEn : m.name}
                      </Link>
                    ) : (
                      <span>
                        <span className="num font-medium">{m.code}</span> — {locale === "en" && m.nameEn ? m.nameEn : m.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{s ? <StatusBadge status={s.status} /> : <span className="text-xs text-muted-foreground">{t("dashboard.notStarted")}</span>}</td>
                  <td className="num px-3 py-2 text-right">{s ? `${s.completion}%` : "—"}</td>
                  <td className="num px-3 py-2 text-right">{s ? s.validationErrors : "—"}</td>
                  <td className="num px-3 py-2 text-right">{s ? formatMoney(Number(s.totalExpenditure), { currencySymbol: settings.currency.symbol }) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

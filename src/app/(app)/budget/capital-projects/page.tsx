import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Construction } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { toAmount } from "@/lib/calculations";
import { formatCalendarDate, formatMoney, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { listCapitalProjects } from "@/lib/services/budget-lists";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Capital projects" };

const STATUSES = ["PROPOSED", "UNDER_REVIEW", "APPROVED", "ACTIVE", "COMPLETED", "SUSPENDED", "CANCELLED"] as const;

export default async function CapitalProjectsPage(props: PageProps<"/budget/capital-projects">) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const mdaId = await resolveMda(sp);
  const [options, rows] = await Promise.all([filterOptions(actor, locale), listCapitalProjects(actor, { year, mdaId, sectorId: param(sp, "sector"), status: param(sp, "status"), q: param(sp, "q")?.trim() || undefined })]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const sum = (f: (r: (typeof rows)[number]) => number) => toAmount(rows.reduce((s, r) => s + f(r), 0));

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.capitalProjects")} description={`${year} · ${t("budget.capitalDescription")}`} breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.capitalProjects") }]} />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-52" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
          { type: "select", key: "status", label: t("common.status"), options: [{ value: "delayed", label: t("budget.delayed") }, ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as "status.DRAFT") }))], width: "w-40" },
          { type: "search", key: "q", label: t("common.search") },
        ]}
      />
      <StatGrid>
        <StatCard label={t("nav.capitalProjects")} value={String(rows.length)} />
        <StatCard label={t("forms.totalProjectCost")} value={money(sum((r) => r.totalCost))} />
        <StatCard label={t("forms.allocation", { year })} value={money(sum((r) => r.allocation))} />
        <StatCard label={t("budget.delayed")} value={String(rows.filter((r) => r.delayed).length)} href={`/budget/capital-projects?year=${year}&status=delayed`} />
      </StatGrid>
      {rows.length === 0 ? (
        <EmptyState icon={Construction} title={t("common.noResults")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.projectName")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.fundingSource")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.totalProjectCost")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.spentToDate")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.progress")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.allocation", { year })}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.expectedCompletion")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top hover:bg-muted/40">
                  <td className="px-3 py-2">
                    {r.submissionId ? (
                      <Link href={`/budget/workspace/${r.submissionId}/f`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">{[r.code, r.location].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.mda}</td>
                  <td className="px-3 py-2 text-xs">{r.funding}</td>
                  <td className="num px-3 py-2 text-right">{money(r.totalCost)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.spent)}</td>
                  <td className="num px-3 py-2 text-right">{formatPercent(r.progress, 0)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.allocation)}</td>
                  <td className="num px-3 py-2 text-xs">
                    {formatCalendarDate(r.completion, { locale })}
                    {r.delayed ? (
                      <span className="mt-0.5 flex items-center gap-1 font-medium text-destructive">
                        <AlertTriangle className="size-3" aria-hidden />
                        {t("budget.delayed")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

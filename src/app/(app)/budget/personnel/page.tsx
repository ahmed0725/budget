import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { toAmount } from "@/lib/calculations";
import { formatMoney, formatNumber } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { listPersonnel } from "@/lib/services/budget-lists";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Personnel budget" };

export default async function PersonnelPage(props: PageProps<"/budget/personnel">) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const mdaId = await resolveMda(sp);
  const [options, rows] = await Promise.all([filterOptions(actor, locale), listPersonnel(actor, { year, mdaId, sectorId: param(sp, "sector") })]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const sum = (f: (r: (typeof rows)[number]) => number) => toAmount(rows.reduce((s, r) => s + f(r), 0));

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.personnel")} description={`${year} · ${t("budget.personnelDescription")}`} breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.personnel") }]} />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-52" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
        ]}
      />
      <StatGrid>
        <StatCard label={t("budget.establishment")} value={formatNumber(sum((r) => r.establishment))} />
        <StatCard label={t("budget.filled")} value={formatNumber(sum((r) => r.filled))} />
        <StatCard label={t("budget.vacant")} value={formatNumber(sum((r) => r.vacant))} />
        <StatCard label={t("budget.annualCost")} value={money(sum((r) => r.annual))} />
      </StatGrid>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("common.noResults")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.positionTitle")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.grade")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.establishment")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.filled")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.vacant")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.monthlyCost")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.annualCost")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/budget/workspace/${r.submissionId}/e`} className="hover:underline">
                      {r.mda}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.position}
                    {r.department ? <span className="block text-xs text-muted-foreground">{r.department}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.grade ?? "—"}</td>
                  <td className="num px-3 py-2 text-right">{formatNumber(r.establishment)}</td>
                  <td className="num px-3 py-2 text-right">{formatNumber(r.filled)}</td>
                  <td className="num px-3 py-2 text-right">{formatNumber(r.vacant)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.monthly)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.annual)}</td>
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

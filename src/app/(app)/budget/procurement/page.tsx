import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { requirePagePermission } from "@/lib/auth/session";
import { toAmount } from "@/lib/calculations";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { listProcurement } from "@/lib/services/budget-lists";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Procurement plans" };

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export default async function ProcurementPage(props: PageProps<"/budget/procurement">) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const mdaId = await resolveMda(sp);
  const [options, rows] = await Promise.all([filterOptions(actor, locale), listProcurement(actor, { year, mdaId, sectorId: param(sp, "sector"), quarter: param(sp, "quarter") })]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.procurement")} description={`${year} · ${t("budget.procurementDescription")}`} breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.procurement") }]} />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-52" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
          { type: "select", key: "quarter", label: t("common.quarter"), options: QUARTERS.map((q) => ({ value: q, label: q })), width: "w-28" },
        ]}
      />
      <StatGrid>
        {QUARTERS.map((q) => (
          <StatCard key={q} label={q} value={money(toAmount(rows.filter((r) => r.quarter === q).reduce((s, r) => s + r.cost, 0)))} hint={`${rows.filter((r) => r.quarter === q).length} ${t("common.count").toLowerCase()}`} />
        ))}
      </StatGrid>
      {rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title={t("common.noResults")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.procurementItem")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.category")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.procurementMethod")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.quarter")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.estimatedCost")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 text-xs">
                    <Link href={`/budget/workspace/${r.submissionId}/g`} className="hover:underline">
                      {r.mda}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.item}
                    {r.department ? <span className="block text-xs text-muted-foreground">{r.department}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.category ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.method ?? "—"}</td>
                  <td className="px-3 py-2">{r.quarter}</td>
                  <td className="num px-3 py-2 text-right">{money(r.cost)}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="px-3 py-2" colSpan={5}>
                  {t("common.total")}
                </td>
                <td className="num px-3 py-2 text-right">{money(toAmount(rows.reduce((s, r) => s + r.cost, 0)))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

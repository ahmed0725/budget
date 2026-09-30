import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { toAmount, withinTolerance } from "@/lib/calculations";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { listCashFlow } from "@/lib/services/budget-lists";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cash flow" };

const KEYS = ["q1", "q2", "q3", "q4"] as const;

export default async function CashFlowPage(props: PageProps<"/budget/cash-flow">) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const mdaId = await resolveMda(sp);
  const [options, rows] = await Promise.all([filterOptions(actor, locale), listCashFlow(actor, { year, mdaId, sectorId: param(sp, "sector") })]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const sum = (k: (typeof KEYS)[number] | "total" | "budget" | "difference") => toAmount(rows.reduce((s, r) => s + r[k], 0));
  const mismatched = rows.filter((r) => !withinTolerance(r.total, r.budget));

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.cashFlow")} description={`${year} · ${t("budget.cashFlowDescription")}`} breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.cashFlow") }]} />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
          ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-52" }] : []),
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
        ]}
      />
      <StatGrid>
        {KEYS.map((k) => (
          <StatCard key={k} label={k.toUpperCase()} value={money(sum(k))} />
        ))}
        <StatCard label={t("budget.forecastMismatch")} value={String(mismatched.length)} />
      </StatGrid>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
              {KEYS.map((k) => (
                <th key={k} scope="col" className="px-3 py-2 text-right font-medium">
                  {k.toUpperCase()}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.total")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("dashboard.totalExpenditure")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.variance")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = !withinTolerance(r.total, r.budget);
              return (
                <tr key={r.submissionId} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/budget/workspace/${r.submissionId}/h`} className="hover:underline">
                      {r.mda}
                    </Link>
                  </td>
                  {KEYS.map((k) => (
                    <td key={k} className="num px-3 py-2 text-right">
                      {money(r[k])}
                    </td>
                  ))}
                  <td className="num px-3 py-2 text-right font-medium">{money(r.total)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.budget)}</td>
                  <td className={cn("num px-3 py-2 text-right", bad && "font-semibold text-destructive")}>
                    {bad ? <AlertTriangle className="mr-1 inline size-3.5" aria-label={t("budget.forecastMismatch")} /> : null}
                    {formatMoney(r.difference, { currencySymbol: settings.currency.symbol, signed: true })}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/50 font-semibold">
              <td className="px-3 py-2">{t("common.total")}</td>
              {KEYS.map((k) => (
                <td key={k} className="num px-3 py-2 text-right">
                  {money(sum(k))}
                </td>
              ))}
              <td className="num px-3 py-2 text-right">{money(sum("total"))}</td>
              <td className="num px-3 py-2 text-right">{money(sum("budget"))}</td>
              <td className="num px-3 py-2 text-right">{formatMoney(sum("difference"), { currencySymbol: settings.currency.symbol, signed: true })}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

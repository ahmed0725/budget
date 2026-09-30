import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { calculateExecutionRate, calculateRevenueCollectionRate, toAmount } from "@/lib/calculations";
import { formatMoney, formatPercent, MONTH_NAMES } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { executionLines } from "@/lib/services/execution";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Monthly execution" };

interface MatrixRow {
  key: string;
  label: string;
  href?: string;
  budget: number;
  months: number[];
}

export default async function MonthlyExecutionPage(props: PageProps<"/execution/monthly">) {
  const actor = await requirePagePermission("execution.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp, "execution");
  const mdaId = await resolveMda(sp);
  const kind = param(sp, "kind") === "REVENUE" ? "REVENUE" : "EXPENDITURE";
  const period = param(sp, "period") === "quarterly" ? "quarterly" : "monthly";
  const options = await filterOptions(actor, locale);
  const executing = options.yearRecords.filter((y) => ["ACTIVE", "PUBLISHED", "CLOSED"].includes(y.status));
  const lines = await executionLines(actor, { year, kind, mdaId });

  // Rows: MDAs (government view) or codes (when one MDA is selected).
  const grouped = new Map<string, MatrixRow>();
  for (const l of lines) {
    const key = mdaId ? l.codeId : l.mdaId;
    const row = grouped.get(key) ?? { key, label: mdaId ? `${l.code} ${l.codeName}` : `${l.mdaCode} ${l.mdaName}`, href: mdaId ? undefined : `/execution/monthly?year=${year}&kind=${kind}&period=${period}&mda=${l.mdaId}`, budget: 0, months: Array(12).fill(0) };
    row.budget = toAmount(row.budget + l.revised);
    l.months.forEach((v, i) => (row.months[i] = toAmount(row.months[i] + v)));
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
  const buckets = period === "quarterly" ? [0, 1, 2, 3].map((q) => ({ label: `Q${q + 1}`, months: [q * 3, q * 3 + 1, q * 3 + 2] })) : MONTH_NAMES[locale].map((m, i) => ({ label: m, months: [i] }));
  const cells = (r: { months: number[] }) => buckets.map((b) => toAmount(b.months.reduce((s, i) => s + r.months[i], 0)));
  const total: MatrixRow = { key: "total", label: t("common.total"), budget: toAmount(rows.reduce((s, r) => s + r.budget, 0)), months: Array.from({ length: 12 }, (_, i) => toAmount(rows.reduce((s, r) => s + r.months[i], 0))) };
  const money = (v: number) => formatMoney(v, { currencySymbol: "", decimals: 0 });
  const rate = (r: MatrixRow) => {
    const actual = toAmount(r.months.reduce((s, v) => s + v, 0));
    return kind === "EXPENDITURE" ? calculateExecutionRate(actual, r.budget) : calculateRevenueCollectionRate(actual, r.budget);
  };
  const toggle = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ year: String(year), mda: mdaId, kind, period, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/execution/monthly?${s}`;
  };
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs hover:bg-muted", active && "border-primary/50 bg-primary/5 font-medium");

  const renderRow = (r: MatrixRow, strong = false) => {
    const actual = toAmount(r.months.reduce((s, v) => s + v, 0));
    return (
      <tr key={r.key} className={cn("border-b last:border-0", strong ? "bg-muted/50 font-semibold" : "hover:bg-muted/40")}>
        <th scope="row" className={cn("sticky left-0 max-w-72 truncate px-3 py-2 text-left", strong ? "bg-muted font-semibold" : "bg-card font-normal")}>
          {r.href ? (
            <Link href={r.href} className="hover:underline">
              {r.label}
            </Link>
          ) : (
            r.label
          )}
        </th>
        {cells(r).map((v, i) => (
          <td key={i} className="num px-2 py-2 text-right text-xs">
            {v ? money(v) : ""}
          </td>
        ))}
        <td className="num px-3 py-2 text-right">{money(actual)}</td>
        <td className="num px-3 py-2 text-right">{money(r.budget)}</td>
        <td className="num px-3 py-2 text-right">{formatPercent(rate(r))}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.monthlyExecution")} description={`${year} · ${kind === "EXPENDITURE" ? t("execution.actualExpenditure") : t("execution.actualRevenue")} (${settings.currency.code})`} breadcrumbs={[{ label: t("nav.execution") }, { label: t("nav.monthlyExecution") }]} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterBar
          filters={[
            { type: "select", key: "year", label: t("common.year"), options: executing.map((y) => ({ value: String(y.year), label: String(y.year) })), required: true, width: "w-28", defaultValue: String(year) },
            { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-72" },
          ]}
        />
        <nav className="flex gap-1" aria-label={t("common.type")}>
          <Link href={toggle({ kind: "EXPENDITURE" })} className={chip(kind === "EXPENDITURE")} aria-current={kind === "EXPENDITURE" ? "true" : undefined}>
            {t("budget.expenditureKind")}
          </Link>
          <Link href={toggle({ kind: "REVENUE" })} className={chip(kind === "REVENUE")} aria-current={kind === "REVENUE" ? "true" : undefined}>
            {t("budget.revenueKind")}
          </Link>
        </nav>
        <nav className="flex gap-1" aria-label={t("execution.period")}>
          <Link href={toggle({ period: "monthly" })} className={chip(period === "monthly")} aria-current={period === "monthly" ? "true" : undefined}>
            {t("execution.monthly")}
          </Link>
          <Link href={toggle({ period: "quarterly" })} className={chip(period === "quarterly")} aria-current={period === "quarterly" ? "true" : undefined}>
            {t("execution.quarterly")}
          </Link>
        </nav>
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">{mdaId ? t("common.code") : t("common.mda")}</th>
              {buckets.map((b) => (
                <th key={b.label} scope="col" className="px-2 py-2 text-right font-medium">
                  {b.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.total")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{kind === "EXPENDITURE" ? t("execution.revisedBudget") : t("execution.revenueTarget")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => renderRow(r))}
            {rows.length ? renderRow(total, true) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

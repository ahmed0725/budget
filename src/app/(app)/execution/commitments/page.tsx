import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { formatCalendarDate, formatMoney, formatNumber } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, resolveMda, resolveYear } from "@/lib/page-params";
import { listCommitments } from "@/lib/services/execution";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { CommitmentActions, NewCommitmentDialog } from "../execution-client";

export const metadata: Metadata = { title: "Commitments" };

const PAGE_SIZE = 50;
const STATUSES = ["COMMITTED", "OBLIGATED", "LIQUIDATED", "CANCELLED"] as const;

export default async function CommitmentsPage(props: PageProps<"/execution/commitments">) {
  const actor = await requirePagePermission("execution.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const year = await resolveYear(sp, "execution");
  const mdaId = await resolveMda(sp);
  const status = param(sp, "status");
  const q = param(sp, "q")?.trim() || undefined;
  const page = Math.max(1, Number(param(sp, "page") ?? 1) || 1);
  const options = await filterOptions(actor, locale);
  const yearRecord = options.yearRecords.find((y) => y.year === year);
  const executing = options.yearRecords.filter((y) => ["ACTIVE", "PUBLISHED", "CLOSED"].includes(y.status));
  const { total, rows, byStatus } = await listCommitments(actor, { year, mdaId, status, q, page, pageSize: PAGE_SIZE });
  const money = (v: unknown) => formatMoney(Number(v), { currencySymbol: settings.currency.symbol });
  const canManage = can(actor, "execution.manage") && yearRecord && ["ACTIVE", "PUBLISHED"].includes(yearRecord.status);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const s = new URLSearchParams(Object.entries({ year: String(year), mda: mdaId, status, q, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/execution/commitments?${s}`;
  };
  const stat = (s: (typeof STATUSES)[number]) => byStatus[s] ?? { amount: 0, count: 0 };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.commitments")}
        description={t("execution.commitmentsDescription", { year })}
        breadcrumbs={[{ label: t("nav.execution") }, { label: t("nav.commitments") }]}
        actions={canManage ? <NewCommitmentDialog year={year} mdas={options.mdas} defaultMdaId={mdaId} /> : null}
      />
      <FilterBar
        filters={[
          { type: "select", key: "year", label: t("common.year"), options: executing.map((y) => ({ value: String(y.year), label: String(y.year) })), required: true, width: "w-28", defaultValue: String(year) },
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-72" },
          { type: "select", key: "status", label: t("common.status"), options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })), width: "w-40" },
          { type: "search", key: "q", label: t("common.search") },
        ]}
      />
      <StatGrid>
        {STATUSES.map((s) => (
          <StatCard key={s} label={t(`status.${s}`)} value={money(stat(s).amount)} hint={`${formatNumber(stat(s).count)} ${t("execution.commitmentsCount")}`} href={`/execution/commitments?year=${year}${mdaId ? `&mda=${mdaId}` : ""}&status=${s}`} />
        ))}
      </StatGrid>
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={t("common.noResults")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("execution.reference")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.date")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.code")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.description")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.amount")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
                {canManage ? (
                  <th scope="col" className="w-28 px-3 py-2">
                    <span className="sr-only">{t("common.actions")}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0 align-top hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono text-xs">{c.reference}</td>
                  <td className="num px-3 py-2 text-xs">{formatCalendarDate(c.commitmentDate, { locale })}</td>
                  <td className="px-3 py-2">
                    <Link href={`/execution/commitments?year=${year}&mda=${c.mdaId}`} className="num hover:underline">
                      {c.mda.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="num font-medium">{c.budgetCode.code}</span> {locale === "en" && c.budgetCode.nameEn ? c.budgetCode.nameEn : c.budgetCode.name}
                  </td>
                  <td className="px-3 py-2">
                    {c.description}
                    {c.supplier ? <span className="block text-xs text-muted-foreground">{c.supplier}</span> : null}
                    {c.cancelReason ? <span className="block text-xs text-destructive">{c.cancelReason}</span> : null}
                  </td>
                  <td className="num px-3 py-2 text-right">{money(c.amount)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  {canManage ? (
                    <td className="px-3 py-1.5">
                      <CommitmentActions id={c.id} status={c.status} reference={c.reference} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={href(page - 1)}>
              {t("common.previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground">{t("common.pageOf", { page, pages })}</span>
          {page < pages ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={href(page + 1)}>
              {t("common.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart2, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/actor";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { reportsFor } from "@/lib/reports/definitions";
import type { ReportGroup } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reporting center" };

const GROUPS: ReportGroup[] = ["budget", "execution", "revenue", "expenditure"];

export default async function ReportsPage(props: PageProps<"/reports">) {
  const actor = await requirePagePermission("reports.view");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const group = GROUPS.includes(param(sp, "group") as ReportGroup) ? (param(sp, "group") as ReportGroup) : null;
  const reports = reportsFor(actor).filter((r) => !group || r.groups.includes(group));
  const label: Record<ReportGroup, string> = { budget: t("nav.budgetReports"), execution: t("nav.executionReports"), revenue: t("nav.revenueReports"), expenditure: t("nav.expenditureReports") };
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs hover:bg-muted", active && "border-primary/50 bg-primary/5 font-medium");

  return (
    <div className="space-y-5">
      <PageHeader title={t("reports.title")} description={t("reports.description")} breadcrumbs={[{ label: t("nav.reports") }, ...(group ? [{ label: label[group] }] : [])]} />
      <nav className="flex flex-wrap gap-1" aria-label={t("nav.reports")}>
        <Link href="/reports" className={chip(!group)} aria-current={!group ? "page" : undefined}>
          {t("common.all")}
        </Link>
        {GROUPS.map((g) => (
          <Link key={g} href={`/reports?group=${g}`} className={chip(group === g)} aria-current={group === g ? "page" : undefined}>
            {label[g]}
          </Link>
        ))}
      </nav>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <li key={r.key}>
            <Link href={`/reports/${r.key}`} className="flex h-full gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
              <FileBarChart2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">{r.title[locale]}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{r.description[locale]}</span>
              </span>
            </Link>
          </li>
        ))}
        {can(actor, "reports.build") || can(actor, "reports.view") ? (
          <li>
            <Link href="/reports/custom" className="flex h-full gap-3 rounded-lg border border-dashed bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
              <SlidersHorizontal className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">{t("reports.builder")}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t("reports.builderDescription")}</span>
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

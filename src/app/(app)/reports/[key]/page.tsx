import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { FilterBar, type FilterDef } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { ReportView } from "@/components/reports/report-view";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { tDynamic } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { reportByKey } from "@/lib/reports/definitions";
import { reportParams } from "@/lib/reports/params";
import { AUDIT_ACTIONS } from "@/lib/services/audit-log";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";

export async function generateMetadata(props: PageProps<"/reports/[key]">): Promise<Metadata> {
  const { key } = await props.params;
  return { title: reportByKey(key)?.title.en ?? "Report" };
}

const SUBMISSION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED", "RETURNED", "APPROVED", "REJECTED", "PUBLISHED"];
const PROJECT_STATUSES = ["PROPOSED", "UNDER_REVIEW", "APPROVED", "ACTIVE", "COMPLETED", "SUSPENDED", "CANCELLED"];

export default async function ReportPage(props: PageProps<"/reports/[key]">) {
  const actor = await requirePagePermission("reports.view");
  const { key } = await props.params;
  const def = reportByKey(key);
  if (!def) notFound();
  if (!def.permissions.every((p) => can(actor, p))) forbidden();
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const [settings, options, params] = await Promise.all([getSettings(), filterOptions(actor, locale), reportParams(sp, def)]);
  const report = await def.run(actor, params, { locale, L: (en, so) => (locale === "so" ? so : en), status: (st) => tDynamic(t, "status", st) });

  const filters: FilterDef[] = [];
  const has = (k: (typeof def.filters)[number]) => def.filters.includes(k);
  if (has("year")) filters.push({ type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(params.year) });
  if (has("compareYear")) filters.push({ type: "select", key: "compareYear", label: t("analysis.compareYear"), options: options.years, required: true, width: "w-28", defaultValue: String(params.compareYear) });
  if (has("dataset"))
    filters.push({
      type: "select",
      key: "dataset",
      label: t("analysis.dataset"),
      options: [
        { value: "effective", label: t("analysis.includeProposals") },
        { value: "approved", label: t("analysis.approvedOnly") },
      ],
      required: true,
      width: "w-56",
      defaultValue: params.dataset,
    });
  if (has("sector") && actor.allMdas) filters.push({ type: "select", key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" });
  if (has("mda")) filters.push({ type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" });
  if (has("submissionStatus")) filters.push({ type: "select", key: "status", label: t("common.status"), options: SUBMISSION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as "status.DRAFT") })), width: "w-44" });
  if (has("projectStatus")) filters.push({ type: "select", key: "status", label: t("common.status"), options: PROJECT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as "status.DRAFT") })), width: "w-40" });
  if (has("from")) filters.push({ type: "date", key: "from", label: t("common.from") });
  if (has("to")) filters.push({ type: "date", key: "to", label: t("common.to") });
  if (has("action")) filters.push({ type: "select", key: "action", label: t("audit.action"), options: AUDIT_ACTIONS.map((a) => ({ value: a, label: a })), width: "w-44" });

  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : [])) as [string, string][]);
  const exportHref = (format: string) => {
    const q = new URLSearchParams(query);
    q.set("format", format);
    if (!q.has("year") && has("year")) q.set("year", String(params.year));
    return `/api/reports/${def.key}?${q}`;
  };
  const canExport = can(actor, "reports.export");

  return (
    <div className="space-y-5">
      <PageHeader
        title={report.title}
        description={report.subtitle}
        breadcrumbs={[{ label: t("nav.reports"), href: "/reports" }, { label: def.title[locale] }]}
        actions={
          <>
            <PrintButton label={t("common.print")} />
            {canExport ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref("pdf")}>
                    <FileText aria-hidden />
                    PDF
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref("xlsx")}>
                    <FileSpreadsheet aria-hidden />
                    Excel
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref("csv")}>
                    <FileDown aria-hidden />
                    CSV
                  </a>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {filters.length ? <FilterBar filters={filters} /> : null}
      <ReportView report={report} cfg={{ symbol: settings.currency.symbol, timezone: settings.timezone, locale }} labels={{ total: t("common.total"), noRows: t("common.noResults") }} />
    </div>
  );
}

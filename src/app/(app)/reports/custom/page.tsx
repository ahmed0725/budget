import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { ErrorState } from "@/components/app/states";
import { ReportView } from "@/components/reports/report-view";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getT } from "@/lib/i18n/server";
import { param, resolveYear } from "@/lib/page-params";
import { BUDGET_MEASURES, decodeConfig, DIMENSIONS, dimensionLabel, EXECUTION_MEASURES, encodeConfig, getSavedReport, listSavedReports, measureLabel, runBuilder, type BuilderConfig } from "@/lib/reports/builder";
import type { ReportResult } from "@/lib/reports/types";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { BuilderForm } from "./builder-form";

export const metadata: Metadata = { title: "Report builder" };

export default async function ReportBuilderPage(props: PageProps<"/reports/custom">) {
  const actor = await requirePagePermission("reports.view");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const [settings, options, savedList, categories] = await Promise.all([getSettings(), filterOptions(actor, locale), listSavedReports(actor), prisma.budgetCategory.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] })]);
  const savedId = param(sp, "saved");
  const saved = savedId ? await getSavedReport(actor, savedId).catch(() => null) : null;
  const fromUrl = decodeConfig(param(sp, "config"));
  const defaults: BuilderConfig = { source: "budget", year: await resolveYear(sp), dataset: "effective", kind: "EXPENDITURE", groupBy: ["mda"], measures: ["amount", "share"], sortBy: "amount", sortDir: "desc" };
  const config = fromUrl ?? saved?.config ?? null;
  let report: ReportResult | null = null;
  let error: string | null = null;
  if (config) {
    try {
      report = await runBuilder(actor, config, locale, saved?.name);
    } catch (e) {
      if (e instanceof AppError) error = e.message;
      else throw e;
    }
  }
  const L = (en: string, so: string) => (locale === "so" ? so : en);
  const labels = {
    builder: t("reports.builder"),
    source: L("Data", "Xogta"),
    sourceBudget: L("Budgets (approved or proposed)", "Miisaaniyadaha"),
    sourceExecution: L("Execution (budget vs actual)", "Fulinta (miisaaniyad iyo dhab)"),
    codePrefix: L("Codes starting with", "Koodhadka ku bilaabma"),
    grouping: L("Grouping", "Kooxaynta"),
    level: L("Level", "Heer"),
    columns: L("Columns", "Tiirarka"),
    sorting: L("Sorting", "Kala-horreynta"),
    sortBy: L("Sort by", "U kala horreysii"),
    direction: L("Direction", "Jihada"),
    descending: L("Largest first", "Kan ugu weyn marka hore"),
    ascending: L("Smallest first", "Kan ugu yar marka hore"),
    limit: L("Maximum rows", "Safafka ugu badan"),
    saveAsNew: L("Save as a new report", "U kaydi warbixin cusub"),
  };
  const exportHref = (format: string) => (config ? `/api/reports/custom?format=${format}&config=${encodeConfig(config)}${saved ? `&saved=${saved.id}` : ""}` : "#");

  return (
    <div className="space-y-5">
      <PageHeader
        title={saved?.name ?? t("reports.builder")}
        description={saved?.description ?? t("reports.builderDescription")}
        breadcrumbs={[{ label: t("nav.reports"), href: "/reports" }, { label: t("reports.builder") }]}
        actions={
          report ? (
            <>
              <PrintButton label={t("common.print")} />
              {can(actor, "reports.export") ? (
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
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_18rem]">
        <div className="no-print">
          <BuilderForm
            key={`${saved?.id ?? "new"}-${param(sp, "config") ?? ""}`}
            initial={{ ...defaults, ...(config ?? {}), sectorId: config?.sectorId ?? null, mdaId: config?.mdaId ?? null, categoryId: config?.categoryId ?? null, codePrefix: config?.codePrefix ?? null, limit: config?.limit ?? null }}
            options={{
              years: options.years,
              sectors: options.sectors,
              mdas: options.mdas,
              categories: categories.map((c) => ({ value: c.id, label: `${c.kind === "REVENUE" ? L("Revenue", "Dakhli") : L("Expenditure", "Kharash")} · ${locale === "en" ? c.name : c.nameSo}` })),
              dimensions: DIMENSIONS.map((d) => ({ value: d, label: dimensionLabel(d, locale) })),
              budgetMeasures: BUDGET_MEASURES.map((m) => ({ value: m, label: measureLabel(m, locale) })),
              executionMeasures: EXECUTION_MEASURES.map((m) => ({ value: m, label: measureLabel(m, locale) })),
            }}
            labels={labels}
            saved={saved ? { id: saved.id, name: saved.name, description: saved.description, isShared: saved.isShared, owned: saved.ownerId === actor.id } : null}
            canSave={can(actor, "reports.build")}
            canExecution={can(actor, "execution.view")}
          />
        </div>
        <aside className="no-print rounded-lg border bg-card" aria-labelledby="saved-reports">
          <h2 id="saved-reports" className="border-b px-4 py-3 text-sm font-semibold">
            {t("reports.savedReports")}
          </h2>
          <ul className="max-h-96 overflow-y-auto p-1 text-sm">
            {savedList.length === 0 ? <li className="px-3 py-2 text-muted-foreground">—</li> : null}
            {savedList.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/custom?saved=${r.id}`} aria-current={r.id === saved?.id ? "page" : undefined} className={cn("block rounded-md px-3 py-2 hover:bg-muted", r.id === saved?.id && "bg-primary/10 font-medium text-primary")}>
                  {r.name}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {r.isShared ? <Share2 className="size-3" aria-label={t("reports.shared")} /> : null}
                    {r.owner.fullName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {error ? <ErrorState title={t("common.errorTitle")} message={error} /> : null}
      {report ? <ReportView report={report} cfg={{ symbol: settings.currency.symbol, timezone: settings.timezone, locale }} labels={{ total: t("common.total"), noRows: t("common.noResults") }} /> : null}
    </div>
  );
}

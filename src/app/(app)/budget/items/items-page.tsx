import { Download } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams, resolveMda, resolveYear, type SearchParams } from "@/lib/page-params";
import { listBudgetItems } from "@/lib/services/budget-lists";
import { filterOptions } from "@/lib/services/options";
import { getSettings } from "@/lib/services/settings";
import { ItemsTable } from "./items-table";

/** Shared body of Budget → Items / Revenue / Expenditure (kind preset for the latter two). */
export async function ItemsPage({ searchParams, kind, navLabel }: { searchParams: Promise<SearchParams>; kind?: "REVENUE" | "EXPENDITURE"; navLabel: "nav.budgetItems" | "nav.revenue" | "nav.expenditure" }) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const settings = await getSettings();
  const year = await resolveYear(sp);
  const mdaId = await resolveMda(sp);
  const table = readTableParams(sp, { pageSize: 50, sort: "mda.asc" });
  const effectiveKind = kind ?? (param(sp, "kind") === "REVENUE" ? "REVENUE" : param(sp, "kind") === "EXPENDITURE" ? "EXPENDITURE" : undefined);
  const [options, categories, result] = await Promise.all([
    filterOptions(actor, locale),
    prisma.budgetCategory.findMany({ where: { isActive: true, ...(effectiveKind ? { kind: effectiveKind } : {}) }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
    listBudgetItems(actor, { year, kind: effectiveKind, mdaId, sectorId: param(sp, "sector"), categoryId: param(sp, "category"), q: table.q, page: table.page, pageSize: table.pageSize, sort: table.sort }),
  ]);
  const money = (v: number) => formatMoney(v, { currencySymbol: settings.currency.symbol });
  const exportQuery = new URLSearchParams(Object.entries({ key: "expenditure", year: String(year), mda: mdaId, format: "xlsx" }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(navLabel)}
        description={`${year} · ${t("budget.itemsDescription")}`}
        breadcrumbs={[{ label: t("nav.budget") }, { label: t(navLabel) }]}
        actions={
          can(actor, "reports.export") ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/${effectiveKind === "REVENUE" ? "revenue" : "expenditure"}?${exportQuery}`}>
                <Download aria-hidden />
                {t("common.exportExcel")}
              </a>
            </Button>
          ) : null
        }
      />
      <StatGrid>
        <StatCard label={t("budget.lines")} value={result.total.toLocaleString("en-US")} />
        {effectiveKind !== "REVENUE" ? <StatCard label={t("dashboard.totalExpenditure")} value={money(result.totals.expenditure)} /> : null}
        {effectiveKind !== "EXPENDITURE" ? <StatCard label={t("dashboard.totalRevenue")} value={money(result.totals.revenue)} /> : null}
      </StatGrid>
      <ItemsTable
        rows={result.rows}
        total={result.total}
        page={table.page}
        pageSize={table.pageSize}
        sort={table.sort}
        canBulk={can(actor, "budget.prepare")}
        toolbar={
          <FilterBar
            filters={[
              { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
              ...(kind ? [] : [{ type: "select" as const, key: "kind", label: t("common.type"), options: [{ value: "EXPENDITURE", label: t("budget.expenditureKind") }, { value: "REVENUE", label: t("budget.revenueKind") }], width: "w-36" }]),
              ...(actor.allMdas ? [{ type: "select" as const, key: "sector", label: t("common.sector"), options: options.sectors, width: "w-52" }] : []),
              { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
              { type: "select", key: "category", label: t("common.category"), options: categories.map((c) => ({ value: c.id, label: locale === "en" ? c.name : c.nameSo })), width: "w-52" },
              { type: "search", key: "q", label: t("common.search") },
            ]}
          />
        }
      />
    </div>
  );
}

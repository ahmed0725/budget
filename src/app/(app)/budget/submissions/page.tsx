import type { Metadata } from "next";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { CreateBudgetDialog } from "@/components/budget/create-budget-dialog";
import { SubmissionTable } from "@/components/budget/submission-table";
import { requirePagePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams, resolveYear } from "@/lib/page-params";
import { toSubmissionRow } from "@/lib/services/dto";
import { creatableMdas, filterOptions } from "@/lib/services/options";
import { listSubmissions } from "@/lib/services/submissions";
import type { SubmissionStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Budget submissions" };

const STATUSES: SubmissionStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED", "RETURNED", "APPROVED", "REJECTED", "PUBLISHED"];

export default async function SubmissionsPage(props: PageProps<"/budget/submissions">) {
  const actor = await requirePagePermission("budget.view");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const table = readTableParams(sp);
  const status = param(sp, "status") as SubmissionStatus | undefined;
  const options = await filterOptions(actor, locale);
  const { rows, total } = await listSubmissions(actor, {
    year,
    status: status && STATUSES.includes(status) ? [status] : undefined,
    sectorId: param(sp, "sector"),
    type: param(sp, "type") === "REVISION" ? "REVISION" : param(sp, "type") === "ORIGINAL" ? "ORIGINAL" : undefined,
    search: table.q,
    sort: table.sort,
    page: table.page,
    pageSize: table.pageSize,
  });
  const yearRecord = options.yearRecords.find((y) => y.year === year);
  const creatable = yearRecord && ["PREPARATION", "DRAFT"].includes(yearRecord.status) ? await creatableMdas(actor, yearRecord.id, locale) : [];

  return (
    <div>
      <PageHeader
        title={t("budget.submissions")}
        description={`${t("common.year")}: ${year}`}
        breadcrumbs={[{ label: t("nav.budget") }, { label: t("nav.submissions") }]}
        actions={yearRecord && creatable.length ? <CreateBudgetDialog year={{ id: yearRecord.id, year }} mdas={creatable} /> : null}
      />
      <SubmissionTable
        rows={rows.map(toSubmissionRow)}
        total={total}
        page={table.page}
        pageSize={table.pageSize}
        sort={table.sort}
        hideYear
        toolbar={
          <FilterBar
            filters={[
              { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
              { type: "select", key: "status", label: t("common.status"), options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
              { type: "select", key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" },
              { type: "select", key: "type", label: t("common.type"), options: [{ value: "ORIGINAL", label: t("status.ORIGINAL") }, { value: "REVISION", label: t("status.REVISION") }], width: "w-36" },
              { type: "search", key: "q", label: t("common.search") },
            ]}
          />
        }
      />
    </div>
  );
}

import type { Metadata } from "next";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams } from "@/lib/page-params";
import { listMdas } from "@/lib/services/admin";
import { MdaFormDialog } from "./mda-form";
import { MdasTable } from "./mdas-table";
import { mdaFormOptions } from "./options";

export const metadata: Metadata = { title: "MDAs" };

export default async function MdasPage(props: PageProps<"/administration/mdas">) {
  await requirePagePermission("admin.mda.manage");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const table = readTableParams(sp, { sort: "code.asc" });
  const active = param(sp, "active") as "active" | "inactive" | undefined;
  const options = await mdaFormOptions(locale);
  const { total, rows } = await listMdas({ q: table.q, sectorId: param(sp, "sector"), active, page: table.page, pageSize: table.pageSize, sort: table.sort });
  return (
    <div>
      <PageHeader title={t("nav.mdas")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.mdas") }]} actions={<MdaFormDialog options={options} />} />
      <MdasTable
        total={total}
        page={table.page}
        pageSize={table.pageSize}
        sort={table.sort}
        rows={rows.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          nameEn: m.nameEn,
          sector: `${m.sector.code} — ${locale === "en" && m.sector.nameEn ? m.sector.nameEn : m.sector.name}`,
          agencyType: m.agencyType ? (locale === "en" && m.agencyType.nameEn ? m.agencyType.nameEn : m.agencyType.name) : null,
          accountingOfficer: m.accountingOfficer,
          isActive: m.isActive,
          users: m._count.assignments,
          budgets: m._count.submissions,
        }))}
        toolbar={
          <FilterBar
            filters={[
              { type: "select", key: "sector", label: t("common.sector"), options: options.sectors, width: "w-64" },
              { type: "select", key: "active", label: t("common.status"), options: [{ value: "active", label: t("common.active") }, { value: "inactive", label: t("common.inactive") }], width: "w-36" },
              { type: "search", key: "q", label: t("common.search") },
            ]}
          />
        }
      />
    </div>
  );
}

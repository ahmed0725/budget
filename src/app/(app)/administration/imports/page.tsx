import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams } from "@/lib/page-params";
import { listImports } from "@/lib/services/imports";
import { getSettings } from "@/lib/services/settings";
import { profileLabel } from "./profiles";

export const metadata: Metadata = { title: "Excel import" };

export default async function ImportsPage(props: PageProps<"/administration/imports">) {
  const actor = await requirePagePermission("import.run", "execution.manage", "admin.codes.manage");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const table = readTableParams(sp, { pageSize: 25 });
  const { total, rows } = await listImports(actor, { page: table.page, pageSize: table.pageSize, profile: param(sp, "profile"), status: param(sp, "status") });
  const pages = Math.max(1, Math.ceil(total / table.pageSize));
  const fmt = { locale, timezone: settings.timezone };
  return (
    <div>
      <PageHeader
        title={t("imports.title")}
        description={t("imports.history")}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.imports") }]}
        actions={
          <Button asChild size="sm">
            <Link href="/administration/imports/new">
              <Plus aria-hidden />
              {t("imports.newImport")}
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title={t("imports.history")} description={t("imports.dropFile")} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.fileName")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.importType")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("imports.totalRows")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("imports.importedRows")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("imports.errors")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.uploadedBy")}</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.uploadedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stored = r.summary as { counts?: { total: number; imported: number; errors: number }; after?: { total: number; imported: number; errors: number } } | null;
                // Imports stored before counts were introduced keep them under "after".
                const counts = stored?.counts ?? stored?.after;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link href={`/administration/imports/${r.id}`} className="font-medium hover:underline">
                        {r.fileName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{profileLabel(r.profile, locale)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="num px-3 py-2 text-right">{counts ? formatNumber(counts.total) : "—"}</td>
                    <td className="num px-3 py-2 text-right">{counts ? formatNumber(counts.imported) : "—"}</td>
                    <td className="num px-3 py-2 text-right">{counts ? formatNumber(counts.errors) : "—"}</td>
                    <td className="px-3 py-2">{r.createdBy.fullName}</td>
                    <td className="num px-3 py-2 text-xs">{formatDateTime(r.createdAt, fmt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="mt-3 flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          {table.page > 1 ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={`/administration/imports?page=${table.page - 1}`}>
              {t("common.previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground">{t("common.pageOf", { page: table.page, pages })}</span>
          {table.page < pages ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={`/administration/imports?page=${table.page + 1}`}>
              {t("common.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

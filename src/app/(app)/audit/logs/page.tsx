import type { Metadata } from "next";
import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { AUDIT_ACTIONS, auditFilterOptions, listAuditLogs, type AuditFilters } from "@/lib/services/audit-log";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Audit logs" };

const PAGE_SIZE = 50;

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Field-by-field view of an audit entry's previous and new values. */
function Changes({ oldValue, newValue, labels }: { oldValue: unknown; newValue: unknown; labels: { field: string; old: string; new: string } }) {
  const o = (oldValue && typeof oldValue === "object" && !Array.isArray(oldValue) ? oldValue : oldValue === null || oldValue === undefined ? {} : { value: oldValue }) as Record<string, unknown>;
  const n = (newValue && typeof newValue === "object" && !Array.isArray(newValue) ? newValue : newValue === null || newValue === undefined ? {} : { value: newValue }) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
  if (!keys.length) return null;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="w-48 px-2 py-1 text-left font-medium">{labels.field}</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">{labels.old}</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">{labels.new}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-b last:border-0 align-top">
              <th scope="row" className="px-2 py-1 text-left font-mono font-normal">{k}</th>
              <td className="px-2 py-1 break-all text-muted-foreground">{show(o[k])}</td>
              <td className="px-2 py-1 break-all">{show(n[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AuditLogsPage(props: PageProps<"/audit/logs">) {
  const actor = await requirePagePermission("audit.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const filters: AuditFilters = {
    action: param(sp, "action"),
    entity: param(sp, "entity"),
    entityId: param(sp, "entityId"),
    userId: param(sp, "user"),
    mdaId: param(sp, "mda"),
    from: param(sp, "from"),
    to: param(sp, "to"),
    q: param(sp, "q")?.trim() || undefined,
  };
  const page = Math.max(1, Number(param(sp, "page") ?? 1) || 1);
  const [{ total, rows }, options] = await Promise.all([listAuditLogs(actor, filters, page, PAGE_SIZE), auditFilterOptions()]);
  const fmt = { locale, timezone: settings.timezone };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = new URLSearchParams(Object.entries({ action: filters.action, entity: filters.entity, entityId: filters.entityId, user: filters.userId, mda: filters.mdaId, from: filters.from, to: filters.to, q: filters.q }).filter(([, v]) => v) as [string, string][]);
  const pageHref = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/audit/logs?${q}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.description")}
        breadcrumbs={[{ label: t("nav.audit") }, { label: t("nav.auditLogs") }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export/audit?${query}`}>
              <Download aria-hidden />
              {t("common.exportCsv")}
            </a>
          </Button>
        }
      />
      <FilterBar
        filters={[
          { type: "select", key: "action", label: t("audit.action"), options: AUDIT_ACTIONS.map((a) => ({ value: a, label: a })), width: "w-44" },
          { type: "select", key: "entity", label: t("audit.entity"), options: options.entities.map((e) => ({ value: e, label: e })), width: "w-48" },
          { type: "select", key: "user", label: t("common.user"), options: options.users, width: "w-56" },
          { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-56" },
          { type: "date", key: "from", label: t("common.from") },
          { type: "date", key: "to", label: t("common.to") },
          { type: "search", key: "q", label: t("common.search") },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("audit.count", { count: formatNumber(total) })}</p>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("common.noResults")} />
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {rows.map((r) => (
            <li key={String(r.id)}>
              <details className="group">
                <summary className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-muted/40 md:grid-cols-[11rem_9rem_1fr_auto]">
                  <span className="num text-xs text-muted-foreground md:order-none">{formatDateTime(r.createdAt, fmt)}</span>
                  <span className="order-first col-span-2 flex items-center gap-2 md:order-none md:col-span-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.action}</span>
                  </span>
                  <span className="col-span-2 min-w-0 text-sm md:col-span-1">
                    {r.summary ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {r.userName ?? "System"} · {r.entityType}
                      {r.ip ? ` · ${r.ip}` : ""}
                    </span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground group-open:hidden md:inline">{t("common.details")}</span>
                </summary>
                <div className="space-y-2 border-t bg-muted/20 px-4 py-3 text-xs">
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-muted-foreground">{t("audit.entity")}</dt>
                    <dd className="font-mono break-all">
                      {r.entityType}
                      {r.entityId ? (
                        <>
                          {" "}
                          <Link className="hover:underline" href={`/audit/logs?entity=${encodeURIComponent(r.entityType)}&entityId=${encodeURIComponent(r.entityId)}`}>
                            {r.entityId}
                          </Link>
                        </>
                      ) : null}
                    </dd>
                    {r.reason ? (
                      <>
                        <dt className="text-muted-foreground">{t("common.reason")}</dt>
                        <dd>{r.reason}</dd>
                      </>
                    ) : null}
                    {r.userAgent ? (
                      <>
                        <dt className="text-muted-foreground">{t("audit.userAgent")}</dt>
                        <dd className="break-all">{r.userAgent}</dd>
                      </>
                    ) : null}
                  </dl>
                  <Changes oldValue={r.oldValue} newValue={r.newValue} labels={{ field: t("imports.field"), old: t("audit.oldValue"), new: t("audit.newValue") }} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={pageHref(page - 1)}>
              {t("common.previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground">{t("common.pageOf", { page, pages })}</span>
          {page < pages ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={pageHref(page + 1)}>
              {t("common.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

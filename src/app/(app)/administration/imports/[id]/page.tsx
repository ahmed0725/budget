import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { PROFILES, type ProfileKey } from "@/lib/imports/profiles";
import { suggestColumns } from "@/lib/imports/profiles/tabular";
import type { ReconciliationItem, RowIssue } from "@/lib/imports/types";
import { param } from "@/lib/page-params";
import { getImport, listImportRows } from "@/lib/services/imports";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { profileLabel } from "../profiles";
import { ImportStepper, type ImportStep } from "../stepper";
import { MappingForm, type DetectedSheet, type DetectedTable } from "./mapping-form";
import { CommitBar, RowActions } from "./row-actions";

export const metadata: Metadata = { title: "Import" };

const PAGE_SIZE = 50;
const ROW_STATUSES = ["VALID", "WARNING", "ERROR", "DUPLICATE", "SKIPPED", "IMPORTED"] as const;

const STEP_OF: Record<string, ImportStep> = { UPLOADED: "map", MAPPED: "validate", VALIDATED: "preview", IMPORTING: "import", FAILED: "import", COMPLETED: "summary", CANCELLED: "summary" };

interface Counts {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  duplicates: number;
  skipped: number;
  imported: number;
}

function money(v: unknown, symbol: string) {
  return formatMoney(Number(v ?? 0), { currencySymbol: symbol });
}

/** One-line description of what a row will import. */
function describe(data: Record<string, unknown>, symbol: string): string {
  const entries = (data.entries ?? []) as { year: number; mdaCode: string; sourceCode: string; targetCode?: string | null; amount: number }[];
  if (data.execution) {
    const e = data.execution as { year: number; month: number; mdaCode: string; code: string; amount: number };
    return `${e.year}-${String(e.month).padStart(2, "0")} · ${e.mdaCode} · ${e.code} · ${money(e.amount, symbol)}`;
  }
  if (data.chart) {
    const c = data.chart as { code: string; name: string; resolvedParent?: string | null; action?: string };
    return `${c.code} ${c.name}${c.resolvedParent ? ` ← ${c.resolvedParent}` : ""}`;
  }
  if (entries.length) {
    const head = `${data.code ?? entries[0].sourceCode}${data.description ? ` ${String(data.description).slice(0, 60)}` : ""}${data.mdaCode ? ` · ${data.mdaCode}` : ""}`;
    return `${head} · ${entries.map((e) => `${e.year}: ${money(e.amount, symbol)}`).join(", ")}`;
  }
  const values = data.values as Record<string, unknown> | undefined;
  if (values) return Object.values(values).filter((v) => v !== null && v !== "").join(" · ");
  return [data.code, data.description].filter(Boolean).join(" ");
}

export default async function ImportDetailPage(props: PageProps<"/administration/imports/[id]">) {
  const actor = await requirePagePermission("import.run", "execution.manage", "admin.codes.manage");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { t, locale } = await getT();
  const settings = await getSettings();
  const imp = await getImport(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const profile = PROFILES[imp.profile as ProfileKey];
  if (!profile) notFound();
  const fmt = { locale, timezone: settings.timezone };
  const symbol = settings.currency.symbol;
  const detected = (imp.detected ?? {}) as { tables?: DetectedTable[]; sheets?: DetectedSheet[]; confidence?: number; previousImport?: { at: string } | null; sheetNames?: { name: string; rows: number }[] };
  const stored = (imp.summary ?? {}) as { counts?: Counts; after?: Counts; commit?: Record<string, unknown>; reconciliation?: ReconciliationItem[]; result?: Record<string, unknown> };
  // Imports stored before counts were introduced keep them under "after"/"commit".
  const summary = { ...stored, counts: stored.counts ?? stored.after, result: stored.result ?? stored.commit };
  const editable = ["UPLOADED", "MAPPED", "VALIDATED", "FAILED"].includes(imp.status);
  const hasRows = imp.status !== "UPLOADED" && imp.status !== "MAPPED";

  const status = param(sp, "status");
  const sheet = param(sp, "sheet");
  const page = Math.max(1, Number(param(sp, "page") ?? 1) || 1);
  const rowData = hasRows ? await listImportRows(id, { status: status && (ROW_STATUSES as readonly string[]).includes(status) ? status : undefined, sheet, page, pageSize: PAGE_SIZE }) : null;

  let mapping: React.ReactNode = null;
  if (editable) {
    const [years, mdas] = await Promise.all([
      prisma.budgetYear.findMany({ orderBy: { year: "desc" }, select: { year: true } }),
      prisma.mda.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true, nameEn: true } }),
    ]);
    const tables = detected.tables ?? [];
    const suggestions = profile.fields ? Object.fromEntries(tables.map((tb) => [tb.sheet, suggestColumns(tb.columns, profile.fields!)])) : {};
    mapping = (
      <MappingForm
        importId={imp.id}
        profileKey={imp.profile}
        fields={profile.fields ? profile.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })) : null}
        tables={tables}
        suggestions={suggestions}
        sheets={detected.sheets ?? []}
        initial={(imp.options ?? {}) as Record<string, unknown>}
        years={years.map((y) => y.year)}
        mdas={mdas.map((m) => ({ value: m.code, label: `${m.code} — ${locale === "en" && m.nameEn ? m.nameEn : m.name}` }))}
      />
    );
  }

  const counts = summary.counts;
  const importable = counts ? counts.valid + counts.warnings : 0;
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { status, sheet, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/administration/imports/${id}${s ? `?${s}` : ""}`;
  };
  const result = summary.result as { groups?: { year: number; mdaCode: string; submissionId: string; status: string; lines: number; total: number }[]; submissionsCreated?: number; submissionsUpdated?: number; linesWritten?: number; codesCreated?: number; created?: number; updated?: number; total?: number } | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={imp.fileName}
        description={`${profileLabel(imp.profile, locale)} · ${t("imports.uploadedBy")} ${imp.createdBy.fullName} · ${formatDateTime(imp.createdAt, fmt)}`}
        badges={<StatusBadge status={imp.status} />}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.imports"), href: "/administration/imports" }, { label: imp.fileName }]}
      />
      <ImportStepper current={STEP_OF[imp.status] ?? "map"} done={imp.status === "COMPLETED"} />

      {imp.status === "FAILED" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {t("imports.failed")} {imp.errorMessage}
        </p>
      ) : null}
      {imp.status === "CANCELLED" ? <p className="rounded-md border bg-muted/40 p-3 text-sm">{t("imports.cancelled")}</p> : null}
      {detected.previousImport && imp.status !== "COMPLETED" ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("imports.previousImport", { date: formatDateTime(detected.previousImport.at, fmt) })}
        </p>
      ) : null}

      {/* Detect + Map */}
      {editable ? (
        <section className="rounded-lg border bg-card" aria-labelledby="map-title">
          <details open={imp.status === "UPLOADED" || imp.status === "MAPPED"} className="group">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h2 id="map-title" className="text-sm font-semibold">
                {imp.status === "UPLOADED" ? `${t("imports.detect")} · ${t("imports.map")}` : t("imports.changeMapping")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("imports.confidence")}: <span className="num font-medium">{formatPercent((detected.confidence ?? 0) * 100, 0)}</span>
                {detected.sheetNames ? ` · ${detected.sheetNames.length} ${t("imports.sheet").toLowerCase()}(s)` : ""}
              </span>
            </summary>
            <div className="border-t p-4">{mapping}</div>
          </details>
        </section>
      ) : null}

      {/* Validate counts */}
      {counts ? (
        <StatGrid>
          <StatCard label={t("imports.totalRows")} value={formatNumber(counts.total)} />
          <StatCard label={t("imports.validRows")} value={formatNumber(counts.valid)} href={link({ status: "VALID", page: undefined })} />
          <StatCard label={t("imports.warnings")} value={formatNumber(counts.warnings)} href={link({ status: "WARNING", page: undefined })} />
          <StatCard label={t("imports.errors")} value={formatNumber(counts.errors)} href={link({ status: "ERROR", page: undefined })} />
          <StatCard label={t("imports.duplicates")} value={formatNumber(counts.duplicates)} href={link({ status: "DUPLICATE", page: undefined })} />
          {imp.status === "COMPLETED" ? <StatCard label={t("imports.importedRows")} value={formatNumber(counts.imported)} href={link({ status: "IMPORTED", page: undefined })} /> : <StatCard label={t("imports.skipped")} value={formatNumber(counts.skipped)} />}
        </StatGrid>
      ) : null}

      {imp.status === "VALIDATED" || imp.status === "FAILED" ? <CommitBar importId={imp.id} importable={importable} /> : null}

      {/* Summary */}
      {imp.status === "COMPLETED" && result ? (
        <section className="rounded-lg border bg-card" aria-labelledby="result-title">
          <h2 id="result-title" className="border-b px-4 py-3 text-sm font-semibold">
            {t("imports.completed")} · {formatDateTime(imp.completedAt, fmt)}
          </h2>
          <dl className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
            {result.submissionsCreated !== undefined ? (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("imports.resultBudgets")} · {t("imports.resultCreated")}</dt>
                  <dd className="num text-base font-semibold">{result.submissionsCreated}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("imports.resultBudgets")} · {t("imports.resultUpdated")}</dt>
                  <dd className="num text-base font-semibold">{result.submissionsUpdated}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("imports.resultLines")}</dt>
                  <dd className="num text-base font-semibold">{result.linesWritten}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("imports.resultCreated")}</dt>
                  <dd className="num text-base font-semibold">{result.created ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("imports.resultUpdated")}</dt>
                  <dd className="num text-base font-semibold">{result.updated ?? 0}</dd>
                </div>
                {result.total !== undefined ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("imports.resultTotal")}</dt>
                    <dd className="num text-base font-semibold">{money(result.total, symbol)}</dd>
                  </div>
                ) : null}
              </>
            )}
          </dl>
          {result.groups?.length ? (
            <div className="relative overflow-x-auto border-t">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.year")}</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.mda")}</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.status")}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t("imports.resultLines")}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((g) => (
                    <tr key={`${g.year}-${g.mdaCode}`} className="border-b last:border-0">
                      <td className="num px-3 py-2">{g.year}</td>
                      <td className="px-3 py-2">
                        <Link href={`/budget/workspace/${g.submissionId}`} className="num font-medium hover:underline">
                          {g.mdaCode}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={g.status} />
                      </td>
                      <td className="num px-3 py-2 text-right">{g.lines}</td>
                      <td className="num px-3 py-2 text-right">{money(g.total, symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Reconciliation */}
      {summary.reconciliation?.length ? (
        <section className="rounded-lg border bg-card" aria-labelledby="recon-title">
          <h2 id="recon-title" className="border-b px-4 py-3 text-sm font-semibold">
            {t("imports.reconciliation")}
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("validation.check")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.calculated")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.expected")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("validation.difference")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("validation.result")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.reconciliation.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2">
                      {r.label}
                      <div className="text-xs text-muted-foreground">
                        {r.sourceLabel} ↔ {r.compareLabel}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">{money(r.sourceValue, symbol)}</td>
                    <td className="num px-3 py-2 text-right">{money(r.compareValue, symbol)}</td>
                    <td className="num px-3 py-2 text-right">{money(r.difference, symbol)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status === "MATCH" ? "PASS" : "WARNING"} label={r.status === "MATCH" ? t("status.PASS") : t("validation.difference")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Preview rows */}
      {rowData ? (
        <section className="rounded-lg border bg-card" aria-labelledby="rows-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id="rows-title" className="text-sm font-semibold">
              {t("imports.preview")} · {t("imports.rows")}
            </h2>
            <nav className="flex flex-wrap gap-1 text-xs" aria-label={t("common.status")}>
              <Link href={link({ status: undefined, page: undefined })} aria-current={!status ? "true" : undefined} className={cn("rounded-md border px-2 py-0.5 hover:bg-muted", !status && "border-primary/50 bg-primary/5 font-medium")}>
                {t("common.all")}
              </Link>
              {ROW_STATUSES.filter((s) => rowData.byStatus[s]).map((s) => (
                <Link key={s} href={link({ status: s, page: undefined })} aria-current={status === s ? "true" : undefined} className={cn("rounded-md border px-2 py-0.5 hover:bg-muted", status === s && "border-primary/50 bg-primary/5 font-medium")}>
                  {t(`status.${s}`)} <span className="num">{rowData.byStatus[s]}</span>
                </Link>
              ))}
            </nav>
          </div>
          {rowData.sheets.length > 1 ? (
            <nav className="flex flex-wrap gap-1 border-b px-4 py-2 text-xs" aria-label={t("imports.sheet")}>
              <Link href={link({ sheet: undefined, page: undefined })} className={cn("rounded-md px-2 py-0.5 hover:bg-muted", !sheet && "bg-muted font-medium")}>
                {t("common.all")}
              </Link>
              {rowData.sheets.map((s) => (
                <Link key={s.name} href={link({ sheet: s.name, page: undefined })} className={cn("rounded-md px-2 py-0.5 hover:bg-muted", sheet === s.name && "bg-muted font-medium")}>
                  {s.name} <span className="num text-muted-foreground">{s.count}</span>
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="w-36 px-3 py-2 text-left font-medium">{t("imports.row")}</th>
                  <th scope="col" className="w-36 px-3 py-2 text-left font-medium">{t("common.status")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.values")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.issues")}</th>
                  {editable ? (
                    <th scope="col" className="w-24 px-3 py-2">
                      <span className="sr-only">{t("common.actions")}</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rowData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      {t("imports.noRows")}
                    </td>
                  </tr>
                ) : null}
                {rowData.rows.map((r) => {
                  const issues = (r.issues ?? []) as unknown as RowIssue[];
                  const data = r.data as Record<string, unknown>;
                  return (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2 text-xs">
                        <span className="text-muted-foreground">{r.sheetName}</span> <span className="num font-medium">#{r.rowNumber}</span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                        {r.resolution === "CORRECTED" ? <div className="mt-1 text-[11px] text-muted-foreground">{t("imports.corrected")}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{describe(data, symbol)}</td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5 text-xs">
                          {issues.map((i, k) => (
                            <li key={k} className="flex items-start gap-1">
                              {i.severity === "ERROR" ? <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" aria-label={t("status.ERROR")} /> : i.severity === "WARNING" ? <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" aria-label={t("status.WARNING")} /> : <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-label={t("status.INFO")} />}
                              <span>{i.message}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      {editable ? (
                        <td className="px-3 py-1.5">
                          {r.status !== "IMPORTED" ? (
                            <RowActions
                              rowId={r.id}
                              rowLabel={`${r.sheetName} #${r.rowNumber}`}
                              skipped={r.resolution === "SKIP"}
                              fields={profile.correctable && profile.fields ? profile.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })) : null}
                              values={(data.values ?? null) as Record<string, string | number | null> | null}
                            />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rowData.total > PAGE_SIZE ? (
            <nav className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm" aria-label="Pagination">
              {page > 1 ? (
                <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={link({ page: String(page - 1) })}>
                  {t("common.previous")}
                </Link>
              ) : null}
              <span className="text-muted-foreground">{t("common.pageOf", { page, pages: Math.ceil(rowData.total / PAGE_SIZE) })}</span>
              {page * PAGE_SIZE < rowData.total ? (
                <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={link({ page: String(page + 1) })}>
                  {t("common.next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

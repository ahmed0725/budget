"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { useT } from "@/lib/i18n/client";

export interface SubmissionRow {
  id: string;
  mdaCode: string;
  mdaName: string;
  mdaNameEn: string | null;
  sector: string;
  year: number;
  type: string;
  revisionNumber: number;
  status: string;
  totalExpenditure: number;
  totalRevenue: number;
  completion: number;
  validationErrors: number;
  validationWarnings: number;
  reviewer: string | null;
  submittedAt: string | null;
  updatedAt: string;
  source: string;
}

export function SubmissionTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  toolbar,
  hideYear,
  tableKey = "submissions",
  emptyTitle,
}: {
  rows: SubmissionRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  sort?: string | null;
  toolbar?: React.ReactNode;
  hideYear?: boolean;
  tableKey?: string;
  emptyTitle?: string;
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();

  const columns = useMemo<ColumnDef<SubmissionRow, unknown>[]>(
    () => [
      {
        id: "mda",
        accessorKey: "mdaCode",
        header: t("common.mda"),
        meta: { label: t("common.mda") } satisfies DataTableColumnMeta,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="min-w-56">
            <span className="num font-medium">{row.original.mdaCode}</span> — {locale === "en" && row.original.mdaNameEn ? row.original.mdaNameEn : row.original.mdaName}
            {row.original.type === "REVISION" ? <span className="ml-1 rounded bg-accent px-1.5 text-[11px] text-accent-foreground">{t("budget.revision")} {row.original.revisionNumber}</span> : null}
            <div className="text-xs text-muted-foreground">{row.original.sector}</div>
          </div>
        ),
      },
      ...(hideYear
        ? []
        : [
            {
              id: "year",
              accessorKey: "year",
              header: t("common.year"),
              meta: { label: t("common.year") } satisfies DataTableColumnMeta,
              cell: ({ row }: { row: { original: SubmissionRow } }) => <span className="num">{row.original.year}</span>,
            } as ColumnDef<SubmissionRow, unknown>,
          ]),
      {
        id: "status",
        accessorKey: "status",
        header: t("common.status"),
        meta: { label: t("common.status") } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "totalExpenditure",
        accessorKey: "totalExpenditure",
        header: t("dashboard.totalExpenditure"),
        meta: { align: "right", label: t("dashboard.totalExpenditure") } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.totalExpenditure),
      },
      {
        id: "totalRevenue",
        accessorKey: "totalRevenue",
        header: t("dashboard.totalRevenue"),
        meta: { align: "right", label: t("dashboard.totalRevenue"), hidden: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.totalRevenue),
      },
      {
        id: "completion",
        accessorKey: "completion",
        header: t("budget.completion"),
        meta: { align: "right", label: t("budget.completion") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${row.original.completion}%` }} />
            </div>
            <span>{row.original.completion}%</span>
          </div>
        ),
      },
      {
        id: "validation",
        header: t("budget.validation"),
        meta: { label: t("budget.validation") } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.validationErrors ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <XCircle className="size-3.5" aria-hidden />
              {t("validation.errors", { count: row.original.validationErrors })}
            </span>
          ) : row.original.validationWarnings ? (
            <span className="inline-flex items-center gap-1 text-warning-foreground dark:text-warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              {t("validation.warnings", { count: row.original.validationWarnings })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t("status.PASS")}
            </span>
          ),
      },
      {
        id: "reviewer",
        accessorKey: "reviewer",
        header: t("workflow.assignedReviewer"),
        enableSorting: false,
        meta: { label: t("workflow.assignedReviewer"), hidden: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => row.original.reviewer ?? <span className="text-muted-foreground">{t("workflow.unassigned")}</span>,
      },
      {
        id: "submittedAt",
        accessorKey: "submittedAt",
        header: t("status.SUBMITTED"),
        meta: { label: t("status.SUBMITTED") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.submittedAt ? fmt.date(row.original.submittedAt) : "—"),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: t("common.lastUpdated", { time: "" }).trim(),
        meta: { label: t("common.lastUpdated", { time: "" }).trim(), hidden: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.dateTime(row.original.updatedAt),
      },
    ],
    [t, fmt, locale, hideYear],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      tableKey={tableKey}
      toolbar={toolbar}
      emptyTitle={emptyTitle}
      onRowClick={(r) => router.push(`/budget/workspace/${r.id}`)}
    />
  );
}

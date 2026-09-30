"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableColumnMeta } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useT } from "@/lib/i18n/client";

interface Row {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  sector: string;
  agencyType: string | null;
  accountingOfficer: string | null;
  isActive: boolean;
  users: number;
  budgets: number;
}

export function MdasTable({ rows, total, page, pageSize, sort, toolbar }: { rows: Row[]; total: number; page: number; pageSize: number; sort: string | null; toolbar: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: "code", accessorKey: "code", header: t("common.code"), meta: { label: t("common.code"), className: "w-24" } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="num font-medium">{row.original.code}</span> },
      {
        id: "name",
        accessorKey: "name",
        header: t("common.name"),
        meta: { label: t("common.name") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div>
            {row.original.name}
            {row.original.nameEn ? <div className="text-xs text-muted-foreground">{row.original.nameEn}</div> : null}
          </div>
        ),
      },
      { id: "sector", accessorKey: "sector", header: t("common.sector"), meta: { label: t("common.sector") } satisfies DataTableColumnMeta },
      { id: "agencyType", accessorKey: "agencyType", enableSorting: false, header: t("admin.agencyType"), meta: { label: t("admin.agencyType") } satisfies DataTableColumnMeta, cell: ({ row }) => row.original.agencyType ?? "—" },
      { id: "accountingOfficer", accessorKey: "accountingOfficer", enableSorting: false, header: t("forms.accountingOfficer"), meta: { label: t("forms.accountingOfficer"), hidden: true } satisfies DataTableColumnMeta, cell: ({ row }) => row.original.accountingOfficer ?? "—" },
      { id: "users", accessorKey: "users", enableSorting: false, header: t("admin.usersCount"), meta: { align: "right", label: t("admin.usersCount") } satisfies DataTableColumnMeta },
      { id: "budgets", accessorKey: "budgets", enableSorting: false, header: t("admin.budgetsCount"), meta: { align: "right", label: t("admin.budgetsCount") } satisfies DataTableColumnMeta },
      { id: "status", enableSorting: false, header: t("common.status"), meta: { label: t("common.status") } satisfies DataTableColumnMeta, cell: ({ row }) => <StatusBadge status={row.original.isActive ? "ACTIVE" : "CLOSED"} label={row.original.isActive ? t("common.active") : t("common.inactive")} /> },
    ],
    [t],
  );
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} total={total} page={page} pageSize={pageSize} sort={sort} tableKey="mdas" toolbar={toolbar} onRowClick={(r) => router.push(`/administration/mdas/${r.id}`)} />;
}

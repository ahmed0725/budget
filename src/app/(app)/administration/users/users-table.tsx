"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableColumnMeta } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { useT } from "@/lib/i18n/client";

export interface UserRow {
  id: string;
  fullName: string;
  username: string;
  email: string;
  jobTitle: string | null;
  roles: string[];
  mdas: string[];
  isActive: boolean;
  locked: boolean;
  mustChangePassword: boolean;
  isDevSeed: boolean;
  lastLoginAt: string | null;
}

export function UsersTable({ rows, total, page, pageSize, sort, toolbar }: { rows: UserRow[]; total: number; page: number; pageSize: number; sort: string | null; toolbar: React.ReactNode }) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "fullName",
        header: t("common.name"),
        meta: { label: t("common.name") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.fullName}</span>
            {row.original.isDevSeed ? <span className="ml-2 rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{t("common.devSeed")}</span> : null}
            {row.original.jobTitle ? <div className="text-xs text-muted-foreground">{row.original.jobTitle}</div> : null}
          </div>
        ),
      },
      { id: "username", accessorKey: "username", header: t("admin.username"), meta: { label: t("admin.username") } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="font-mono text-xs">{row.original.username}</span> },
      { id: "email", accessorKey: "email", header: t("forms.email"), meta: { label: t("forms.email"), hidden: true } satisfies DataTableColumnMeta },
      { id: "roles", enableSorting: false, header: t("admin.roles"), meta: { label: t("admin.roles") } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="text-xs">{row.original.roles.join(", ")}</span> },
      { id: "mdas", enableSorting: false, header: t("nav.mdas"), meta: { label: t("nav.mdas") } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="num text-xs">{row.original.mdas.join(", ") || "—"}</span> },
      { id: "lastLogin", accessorKey: "lastLoginAt", header: t("admin.lastLogin"), meta: { label: t("admin.lastLogin") } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="num text-xs">{row.original.lastLoginAt ? fmt.dateTime(row.original.lastLoginAt) : t("admin.never")}</span> },
      {
        id: "status",
        enableSorting: false,
        header: t("common.status"),
        meta: { label: t("common.status") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.isActive ? "ACTIVE" : "CLOSED"} label={row.original.isActive ? t("common.active") : t("common.inactive")} />
            {row.original.locked ? <StatusBadge status="REJECTED" label={t("admin.locked")} /> : null}
            {row.original.mustChangePassword ? <StatusBadge status="WARNING" label={t("admin.passwordPending")} /> : null}
          </div>
        ),
      },
    ],
    [t, fmt],
  );
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} total={total} page={page} pageSize={pageSize} sort={sort} tableKey="users" toolbar={toolbar} onRowClick={(r) => router.push(`/administration/users/${r.id}`)} />;
}

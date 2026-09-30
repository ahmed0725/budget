import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams } from "@/lib/page-params";
import { listUsers } from "@/lib/services/admin";
import { userFormOptions } from "./options";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage(props: PageProps<"/administration/users">) {
  await requirePagePermission("admin.users.manage");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const table = readTableParams(sp, { sort: "name.asc" });
  const status = param(sp, "status") as "active" | "inactive" | "locked" | undefined;
  const [options, { total, rows }] = await Promise.all([
    userFormOptions(locale),
    listUsers({ q: table.q, roleId: param(sp, "role"), mdaId: param(sp, "mda"), active: status, page: table.page, pageSize: table.pageSize, sort: table.sort }),
  ]);
  const now = new Date();
  return (
    <div>
      <PageHeader
        title={t("nav.users")}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.users") }]}
        actions={
          <Button asChild size="sm">
            <Link href="/administration/users/new">
              <Plus aria-hidden />
              {t("admin.newUser")}
            </Link>
          </Button>
        }
      />
      <UsersTable
        total={total}
        page={table.page}
        pageSize={table.pageSize}
        sort={table.sort}
        rows={rows.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          jobTitle: u.jobTitle,
          roles: u.roles.map((r) => (locale === "so" && r.role.nameSo ? r.role.nameSo : r.role.name)),
          mdas: [...new Set(u.mdaAssignments.map((a) => a.mda.code))],
          isActive: u.isActive,
          locked: Boolean(u.lockedUntil && u.lockedUntil > now),
          mustChangePassword: u.mustChangePassword,
          isDevSeed: u.isDevSeed,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
        toolbar={
          <FilterBar
            filters={[
              { type: "select", key: "role", label: t("admin.roles"), options: options.roles.map((r) => ({ value: r.value, label: r.label })), width: "w-52" },
              { type: "select", key: "mda", label: t("common.mda"), options: options.mdas, width: "w-64" },
              {
                type: "select",
                key: "status",
                label: t("common.status"),
                options: [
                  { value: "active", label: t("common.active") },
                  { value: "inactive", label: t("common.inactive") },
                  { value: "locked", label: t("admin.locked_filter") },
                ],
                width: "w-36",
              },
              { type: "search", key: "q", label: t("common.search") },
            ]}
          />
        }
      />
    </div>
  );
}

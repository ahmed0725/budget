import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage(props: PageProps<"/administration/roles">) {
  await requirePagePermission("admin.roles.manage");
  const { t } = await getT();
  const sp = await props.searchParams;
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } },
  });
  const permissions = (Object.keys(PERMISSIONS) as PermissionKey[]).map((key) => ({ key, name: PERMISSIONS[key].name, group: PERMISSIONS[key].group }));
  return (
    <div>
      <PageHeader title={t("nav.roles")} description={t("admin.permissionMatrix")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.roles") }]} />
      <RolesManager
        selected={param(sp, "role") ?? roles[0]?.id ?? null}
        permissions={permissions}
        roles={roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          nameSo: r.nameSo,
          description: r.description,
          isSystem: r.isSystem,
          users: r._count.users,
          permissions: r.permissions.map((p) => p.permission.key),
        }))}
      />
    </div>
  );
}

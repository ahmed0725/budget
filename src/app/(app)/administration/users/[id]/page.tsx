import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";
import { userFormOptions } from "../options";
import { UserAccountActions, UserForm } from "../user-form";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage(props: PageProps<"/administration/users/[id]">) {
  await requirePagePermission("admin.users.manage");
  const { id } = await props.params;
  const { t, locale } = await getT();
  const settings = await getSettings();
  const user = await prisma.user.findUnique({ where: { id }, include: { roles: true, mdaAssignments: true } });
  if (!user || user.deletedAt) notFound();
  const [options, activity] = await Promise.all([
    userFormOptions(locale),
    prisma.auditLog.findMany({ where: { OR: [{ userId: id }, { entityType: "User", entityId: id }] }, orderBy: { id: "desc" }, take: 15, select: { id: true, action: true, summary: true, createdAt: true, userName: true } }),
  ]);
  const fmt = { locale, timezone: settings.timezone };
  const locked = Boolean(user.lockedUntil && user.lockedUntil > new Date());
  return (
    <div className="space-y-6">
      <PageHeader
        title={user.fullName}
        description={`${user.username} · ${user.email}`}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.users"), href: "/administration/users" }, { label: user.username }]}
        badges={
          <>
            <StatusBadge status={user.isActive ? "ACTIVE" : "CLOSED"} label={user.isActive ? t("common.active") : t("common.inactive")} />
            {locked ? <StatusBadge status="REJECTED" label={t("admin.lockedUntil", { time: formatDateTime(user.lockedUntil, fmt) })} /> : null}
            {user.mustChangePassword ? <StatusBadge status="WARNING" label={t("admin.passwordPending")} /> : null}
            {user.isDevSeed ? <StatusBadge status="INFO" label={t("admin.devSeedAccount")} /> : null}
          </>
        }
        actions={<UserAccountActions userId={user.id} locked={locked} />}
      />
      <UserForm
        userId={user.id}
        options={options}
        defaults={{
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          jobTitle: user.jobTitle,
          phone: user.phone,
          locale: user.locale === "so" ? "so" : "en",
          isActive: user.isActive,
          roleIds: user.roles.map((r) => r.roleId),
          assignments: user.mdaAssignments.map((a) => ({ mdaId: a.mdaId, type: a.type })),
        }}
      />
      <section className="rounded-lg border bg-card" aria-labelledby="u-activity">
        <h2 id="u-activity" className="border-b px-4 py-3 text-sm font-semibold">
          {t("audit.title")} · {t("admin.lastLogin")}: <span className="num font-normal">{user.lastLoginAt ? formatDateTime(user.lastLoginAt, fmt) : t("admin.never")}</span>
        </h2>
        <ul className="divide-y text-sm">
          {activity.length === 0 ? <li className="px-4 py-3 text-muted-foreground">—</li> : null}
          {activity.map((a) => (
            <li key={String(a.id)} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
              <span>
                <span className="mr-2 rounded bg-muted px-1.5 py-px font-mono text-[10px]">{a.action}</span>
                {a.summary}
                {a.userName && a.userName !== user.fullName ? <span className="text-xs text-muted-foreground"> · {a.userName}</span> : null}
              </span>
              <span className="num text-xs text-muted-foreground">{formatDateTime(a.createdAt, fmt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

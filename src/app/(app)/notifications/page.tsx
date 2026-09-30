import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { MarkAllReadButton, NotificationLink } from "./notification-actions";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_SIZE = 30;
const GROUPS: Record<string, NotificationType[]> = {
  workflow: ["BUDGET_SUBMITTED", "BUDGET_RETURNED", "BUDGET_APPROVED", "BUDGET_REJECTED", "BUDGET_PUBLISHED", "REVIEW_ASSIGNED", "REVIEW_STAGE_ADVANCED"],
  corrections: ["CORRECTION_REQUIRED", "CORRECTION_RESOLVED", "VALIDATION_ERROR", "COMMENT_ADDED"],
  deadlines: ["DEADLINE_APPROACHING"],
  system: ["IMPORT_COMPLETED", "SYSTEM"],
};

export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const actor = await requireActor();
  const { t, locale } = await getT();
  const settings = await getSettings();
  const sp = await props.searchParams;
  const show = param(sp, "show") === "unread" ? "unread" : "all";
  const group = param(sp, "group");
  const page = Math.max(1, Number(param(sp, "page") ?? 1) || 1);
  const where: Prisma.NotificationWhereInput = { userId: actor.id, ...(show === "unread" ? { isRead: false } : {}), ...(group && GROUPS[group] ? { type: { in: GROUPS[group] } } : {}) };
  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.id, isRead: false } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ show: show === "unread" ? "unread" : undefined, group, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/notifications${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) => cn("rounded-md border px-2 py-0.5 text-xs hover:bg-muted", active && "border-primary/50 bg-primary/5 font-medium");
  const groupLabel: Record<string, string> = { workflow: t("notifications.groupWorkflow"), corrections: t("notifications.groupCorrections"), deadlines: t("notifications.groupDeadlines"), system: t("notifications.groupSystem") };

  return (
    <div className="space-y-4">
      <PageHeader title={t("notifications.title")} description={t("notifications.unread", { count: unread })} actions={unread ? <MarkAllReadButton /> : null} />
      <nav className="flex flex-wrap items-center gap-1" aria-label={t("common.filters")}>
        <Link href={href({ show: undefined, page: undefined })} className={chip(show === "all")}>
          {t("common.all")}
        </Link>
        <Link href={href({ show: "unread", page: undefined })} className={chip(show === "unread")}>
          {t("notifications.unreadOnly")}
        </Link>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Link href={href({ group: undefined, page: undefined })} className={chip(!group)}>
          {t("notifications.allTypes")}
        </Link>
        {Object.keys(GROUPS).map((g) => (
          <Link key={g} href={href({ group: g, page: undefined })} className={chip(group === g)}>
            {groupLabel[g]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.empty")} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.isRead && "bg-primary/5")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <NotificationLink id={n.id} href={n.link} unread={!n.isRead} title={n.title} />
                  <time className="num text-xs text-muted-foreground" dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt, { locale, timezone: settings.timezone })}>
                    {formatRelative(n.createdAt, locale)}
                  </time>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                {!n.isRead ? <span className="sr-only">{t("notifications.unreadLabel")}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={href({ page: String(page - 1) })}>
              {t("common.previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground">{t("common.pageOf", { page, pages })}</span>
          {page < pages ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-muted" href={href({ page: String(page + 1) })}>
              {t("common.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

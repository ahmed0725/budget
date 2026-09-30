/**
 * Notification service. In-app notifications are stored in the database; delivery
 * channels are pluggable so e-mail (or SMS) can be added without touching callers.
 */
import type { NotificationType } from "@/generated/prisma/client";
import type { PermissionKey } from "@/lib/auth/permissions";
import { prisma, type Tx } from "@/lib/db";

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Prevents duplicates (e.g. one deadline reminder per user per day). */
  dedupeKey?: string | null;
}

export interface NotificationChannel {
  name: string;
  deliver(userIds: string[], message: NotificationMessage, client: Tx | typeof prisma): Promise<void>;
}

const inAppChannel: NotificationChannel = {
  name: "in-app",
  async deliver(userIds, message, client) {
    if (userIds.length === 0) return;
    await client.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: message.type,
        title: message.title,
        body: message.body,
        link: message.link ?? null,
        entityType: message.entityType ?? null,
        entityId: message.entityId ?? null,
        dedupeKey: message.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
  },
};

/**
 * Additional channels (e.g. an SMTP e-mail channel) register here. They receive the
 * same message after the in-app notification is stored.
 */
const channels: NotificationChannel[] = [inAppChannel];

export function registerNotificationChannel(channel: NotificationChannel) {
  if (!channels.some((c) => c.name === channel.name)) channels.push(channel);
}

export async function notifyUsers(client: Tx | typeof prisma, userIds: string[], message: NotificationMessage): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const channel of channels) {
    await channel.deliver(unique, message, client);
  }
}

/** Users holding a permission, optionally limited to those who can access an MDA. */
export async function usersWithPermission(client: Tx | typeof prisma, permission: PermissionKey, mdaId?: string): Promise<string[]> {
  const users = await client.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
    },
    select: {
      id: true,
      mdaAssignments: { select: { mdaId: true } },
      roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  return users
    .filter((u) => {
      if (!mdaId) return true;
      const allMdas = u.roles.some((r) => r.role.permissions.some((p) => p.permission.key === "scope.all_mdas"));
      return allMdas || u.mdaAssignments.some((a) => a.mdaId === mdaId);
    })
    .map((u) => u.id);
}

/** Agency staff assigned to an MDA (budget, finance and accounting officers). */
export async function agencyUsers(client: Tx | typeof prisma, mdaId: string): Promise<string[]> {
  const rows = await client.userMdaAssignment.findMany({
    where: { mdaId, type: { in: ["BUDGET_OFFICER", "FINANCE_OFFICER", "ACCOUNTING_OFFICER"] }, user: { isActive: true, deletedAt: null } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function notifyPermissionHolders(client: Tx | typeof prisma, permission: PermissionKey, message: NotificationMessage, mdaId?: string) {
  const ids = await usersWithPermission(client, permission, mdaId);
  await notifyUsers(client, ids, message);
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(userId: string, ids: string[] | "all"): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { isRead: true, readAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Deadline reminders
// ─────────────────────────────────────────────────────────────────────────────

let lastReminderRun = 0;

/**
 * Remind the staff of every MDA that has not yet submitted its budget as the
 * submission deadline approaches (at the configured number of days, 3 days, 1 day)
 * and once the deadline has passed. Idempotent: each reminder has a dedupe key.
 * Runs at most once an hour per server process; call it from frequently used pages
 * or from a scheduler.
 */
export async function sendDeadlineReminders(opts: { reminderDays: number; force?: boolean; now?: Date }): Promise<number> {
  const now = opts.now ?? new Date();
  if (!opts.force && now.getTime() - lastReminderRun < 3_600_000) return 0;
  lastReminderRun = now.getTime();
  const years = await prisma.budgetYear.findMany({ where: { status: "PREPARATION", submissionDeadline: { not: null } } });
  let sent = 0;
  for (const year of years) {
    const deadline = year.submissionDeadline!;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.round((deadline.getTime() - today) / 86_400_000);
    const bucket = days < 0 ? "overdue" : days <= 1 ? "1d" : days <= 3 ? "3d" : days <= opts.reminderDays ? `${opts.reminderDays}d` : null;
    if (!bucket) continue;
    const pending = await prisma.mda.findMany({
      where: { isActive: true, deletedAt: null, submissions: { none: { budgetYearId: year.id, type: "ORIGINAL", status: { notIn: ["DRAFT", "RETURNED"] } } } },
      select: { id: true, code: true, name: true, submissions: { where: { budgetYearId: year.id, type: "ORIGINAL" }, select: { id: true } } },
    });
    const date = deadline.toISOString().slice(0, 10);
    for (const mda of pending) {
      const users = await agencyUsers(prisma, mda.id);
      if (!users.length) continue;
      const submissionId = mda.submissions[0]?.id;
      await notifyUsers(prisma, users, {
        type: "DEADLINE_APPROACHING",
        title: bucket === "overdue" ? `${year.year} budget overdue: ${mda.code}` : `${year.year} budget due in ${days} day(s)`,
        body: bucket === "overdue" ? `The submission deadline (${date}) has passed and the ${year.year} budget of ${mda.code} — ${mda.name} has not been submitted.` : `The ${year.year} budget of ${mda.code} — ${mda.name} must be submitted by ${date}.`,
        link: submissionId ? `/budget/workspace/${submissionId}` : `/budget/submissions?year=${year.year}`,
        entityType: "BudgetYear",
        entityId: year.id,
        dedupeKey: `deadline:${year.year}:${mda.id}:${bucket}`,
      });
      sent += users.length;
    }
  }
  return sent;
}

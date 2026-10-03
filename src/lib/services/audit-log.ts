/**
 * Read access to the immutable audit trail (Audit → Audit logs).
 */
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import { can, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError } from "@/lib/errors";

export const AUDIT_ACTIONS: AuditAction[] = [
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
  "PASSWORD_CHANGE",
  "CREATE",
  "UPDATE",
  "DELETE",
  "RESTORE",
  "SUBMIT",
  "RETURN",
  "RECOMMEND",
  "ENDORSE",
  "APPROVE",
  "REJECT",
  "PUBLISH",
  "REOPEN",
  "CERTIFY",
  "IMPORT",
  "EXPORT",
  "PERMISSION_CHANGE",
  "VALIDATE",
  "ASSIGN",
];

export interface AuditFilters {
  action?: string;
  entity?: string;
  userId?: string;
  mdaId?: string;
  from?: string;
  to?: string;
  q?: string;
  entityId?: string;
}

function where(f: AuditFilters): Prisma.AuditLogWhereInput {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  return {
    ...(f.action && (AUDIT_ACTIONS as string[]).includes(f.action) ? { action: f.action as AuditAction } : {}),
    ...(f.entity ? { entityType: f.entity } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.mdaId ? { mdaId: f.mdaId } : {}),
    ...(f.from && day.test(f.from) ? { createdAt: { gte: new Date(`${f.from}T00:00:00+03:00`) } } : {}),
    ...(f.to && day.test(f.to) ? { AND: [{ createdAt: { lt: new Date(new Date(`${f.to}T00:00:00+03:00`).getTime() + 86_400_000) } }] } : {}),
    ...(f.q ? { OR: [{ summary: { contains: f.q } }, { userName: { contains: f.q } }, { entityId: f.q }, { ip: f.q }] } : {}),
  };
}

export async function listAuditLogs(actor: Actor, filters: AuditFilters, page: number, pageSize: number) {
  if (!can(actor, "audit.view")) throw new AuthorizationError();
  const w = where(filters);
  const [total, rows] = await Promise.all([prisma.auditLog.count({ where: w }), prisma.auditLog.findMany({ where: w, orderBy: { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  return { total, rows };
}

/** Rows for CSV export (bounded to keep exports responsive). */
export async function exportAuditLogs(actor: Actor, filters: AuditFilters, limit = 50_000) {
  if (!can(actor, "audit.view")) throw new AuthorizationError();
  return prisma.auditLog.findMany({ where: where(filters), orderBy: { id: "desc" }, take: limit });
}

export async function auditFilterOptions() {
  const [entities, users, mdas] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["entityType"], _count: { _all: true }, orderBy: { entityType: "asc" } }),
    prisma.user.findMany({ where: { deletedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, username: true } }),
    prisma.mda.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return {
    entities: entities.map((e) => e.entityType),
    users: users.map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    mdas: mdas.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })),
  };
}

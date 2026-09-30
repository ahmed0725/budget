/**
 * Audit trail. Every important action writes an immutable audit_logs row
 * (UPDATE/DELETE are rejected by a database trigger).
 */
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db";

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  mdaId?: string | null;
  budgetYearId?: string | null;
  summary?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/** Convert Decimals, Dates and BigInts into JSON-safe primitives. */
export function jsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && typeof (v as { d?: unknown }).d !== "undefined") {
        return (v as { toString(): string }).toString();
      }
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

/** Keep only the fields that changed between two records. */
export function changedFields<T extends Record<string, unknown>>(before: T | null | undefined, after: Partial<T>): { oldValue: Partial<T>; newValue: Partial<T> } | null {
  const oldValue: Partial<T> = {};
  const newValue: Partial<T> = {};
  const isDecimal = (x: unknown) => Boolean(x && typeof x === "object" && typeof (x as { toFixed?: unknown }).toFixed === "function" && "d" in (x as object));
  const norm = (x: unknown): string | null => {
    if (x === null || x === undefined || x === "") return null;
    if (x instanceof Date) return x.toISOString();
    if (isDecimal(x)) return String(x);
    if (typeof x === "object") return JSON.stringify(jsonSafe(x));
    return String(x);
  };
  const same = (a: unknown, b: unknown) => {
    const na = norm(a);
    const nb = norm(b);
    if (na === nb) return true;
    // Amounts may arrive as Prisma Decimals on one side and numbers/strings on the other.
    if (na !== null && nb !== null && /^-?\d+(\.\d+)?$/.test(na) && /^-?\d+(\.\d+)?$/.test(nb)) return Number(na) === Number(nb);
    return false;
  };
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before?.[key];
    const b = after[key];
    if (!same(a, b)) {
      oldValue[key] = a as T[keyof T];
      newValue[key] = b as T[keyof T];
    }
  }
  return Object.keys(newValue).length === 0 ? null : { oldValue, newValue };
}

export async function audit(client: Tx | typeof prisma, actor: Actor | null, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: actor && actor.id !== "system" ? actor.id : null,
      userName: actor?.name ?? "System",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      mdaId: entry.mdaId ?? null,
      budgetYearId: entry.budgetYearId ?? null,
      summary: entry.summary ?? null,
      oldValue: jsonSafe(entry.oldValue),
      newValue: jsonSafe(entry.newValue),
      reason: entry.reason ?? null,
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
    },
  });
}

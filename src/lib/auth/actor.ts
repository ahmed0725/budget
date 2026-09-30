/**
 * The authenticated principal passed to every service. Services never read cookies
 * or headers themselves; they authorise against this object.
 */
import type { PermissionKey } from "./permissions";

export type Locale = "en" | "so";

export interface MdaAssignment {
  mdaId: string;
  type: "BUDGET_OFFICER" | "FINANCE_OFFICER" | "ACCOUNTING_OFFICER" | "REVIEWER" | "VIEWER";
}

export interface Actor {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  locale: Locale;
  roles: string[];
  permissions: ReadonlySet<PermissionKey>;
  assignments: MdaAssignment[];
  /** Access to every MDA (permission scope.all_mdas). */
  allMdas: boolean;
  /** Restricted to approved/published data (permission scope.approved_only). */
  approvedOnly: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export function can(actor: Actor, permission: PermissionKey): boolean {
  return actor.permissions.has(permission);
}

export function canAny(actor: Actor, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => actor.permissions.has(p));
}

export function assignedMdaIds(actor: Actor): string[] {
  return [...new Set(actor.assignments.map((a) => a.mdaId))];
}

/** True when the actor may see data of the given MDA. */
export function canAccessMda(actor: Actor, mdaId: string): boolean {
  return actor.allMdas || actor.assignments.some((a) => a.mdaId === mdaId);
}

/** True when the actor belongs to the MDA as agency staff (not a Ministry reviewer). */
export function isAgencyMember(actor: Actor, mdaId: string): boolean {
  return actor.assignments.some((a) => a.mdaId === mdaId && a.type !== "REVIEWER" && a.type !== "VIEWER");
}

/**
 * Prisma `where` fragment restricting a query to the MDAs the actor may see.
 * Returns `undefined` when the actor has access to all MDAs.
 */
export function mdaScope(actor: Actor): { in: string[] } | undefined {
  return actor.allMdas ? undefined : { in: assignedMdaIds(actor) };
}

/** Submission statuses visible to the actor (approved-only viewers see approved/published). */
export function visibleStatuses(actor: Actor): ("APPROVED" | "PUBLISHED")[] | undefined {
  return actor.approvedOnly ? ["APPROVED", "PUBLISHED"] : undefined;
}

/** A system actor for seed scripts and background jobs. */
export function systemActor(permissions: Iterable<PermissionKey>): Actor {
  return {
    id: "system",
    name: "System",
    email: "system@localhost",
    jobTitle: null,
    locale: "en",
    roles: ["SYSTEM"],
    permissions: new Set(permissions),
    assignments: [],
    allMdas: true,
    approvedOnly: false,
  };
}

import type { Prisma } from "@/generated/prisma/client";
import type { prisma, Tx } from "@/lib/db";
import type { Actor, Locale } from "./actor";
import type { PermissionKey } from "./permissions";

export const actorUserInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  mdaAssignments: true,
} satisfies Prisma.UserInclude;

export type ActorUser = Prisma.UserGetPayload<{ include: typeof actorUserInclude }>;

export function actorFromUser(user: ActorUser, meta: { ip?: string | null; userAgent?: string | null } = {}): Actor {
  const permissions = new Set<PermissionKey>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    jobTitle: user.jobTitle,
    locale: (user.locale === "so" ? "so" : "en") as Locale,
    roles: user.roles.map((r) => r.role.key),
    permissions,
    assignments: user.mdaAssignments.map((a) => ({ mdaId: a.mdaId, type: a.type })),
    allMdas: permissions.has("scope.all_mdas"),
    approvedOnly: permissions.has("scope.approved_only"),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  };
}

/** Build the actor for a user id (seed scripts, tests, background jobs). */
export async function loadActor(client: Tx | typeof prisma, userId: string): Promise<Actor> {
  const user = await client.user.findUniqueOrThrow({ where: { id: userId }, include: actorUserInclude });
  return actorFromUser(user);
}

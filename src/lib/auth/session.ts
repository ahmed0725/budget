import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { getSettings } from "@/lib/services/settings";
import type { Actor } from "./actor";
import { actorFromUser, actorUserInclude } from "./actor-loader";
import type { PermissionKey } from "./permissions";

export const SESSION_COOKIE = "gbms_session";

function hashToken(token: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be configured (at least 16 characters)");
  }
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string): Promise<void> {
  const settings = await getSettings();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + settings.security.sessionHours * 3600_000);
  const meta = await requestMeta();
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

const loadSession = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: actorUserInclude } },
  });
  if (!session) return null;
  const now = Date.now();
  const settings = await getSettings();
  const idleMs = settings.security.idleTimeoutMinutes * 60_000;
  if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > idleMs || !session.user.isActive || session.user.deletedAt) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
});

/** The signed-in actor for this request, or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await loadSession();
  if (!session) return null;
  return actorFromUser(session.user, await requestMeta());
});

export const getSessionFlags = cache(async () => {
  const session = await loadSession();
  return session ? { mustChangePassword: session.user.mustChangePassword } : null;
});

/**
 * For pages and layouts: redirect to the login page when signed out, and to the
 * profile page while a temporary password has not been changed yet.
 */
export async function requireActor(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!opts.allowPendingPasswordChange && (await getSessionFlags())?.mustChangePassword) redirect("/profile?changePassword=1");
  return actor;
}

/** For pages: render the 403 page unless the actor has one of the permissions. */
export async function requirePagePermission(...anyOf: PermissionKey[]): Promise<Actor> {
  const actor = await requireActor();
  if (anyOf.length > 0 && !anyOf.some((p) => actor.permissions.has(p))) forbidden();
  return actor;
}

/** For server actions and route handlers: throw when signed out or unauthorised. */
export async function actorForAction(...anyOf: PermissionKey[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthenticationError();
  if ((await getSessionFlags())?.mustChangePassword) throw new AuthorizationError("Change your temporary password (Profile → Change password) before continuing.");
  if (anyOf.length > 0 && !anyOf.some((p) => actor.permissions.has(p))) throw new AuthorizationError();
  return actor;
}

/** The actor's open sessions, newest first; `current` marks this device. */
export async function listOwnSessions(userId: string) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : null;
  const sessions = await prisma.session.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  return sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.tokenHash === currentHash }));
}

/** Sign out every other device of the user; returns how many sessions were ended. */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const res = await prisma.session.deleteMany({ where: { userId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) } });
  return res.count;
}

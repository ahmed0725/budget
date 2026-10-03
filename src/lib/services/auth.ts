import "server-only";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword, verifyPassword, checkPasswordPolicy } from "@/lib/auth/password";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { BusinessRuleError, ValidationFailedError } from "@/lib/errors";
import { audit } from "./audit";
import { getSettings } from "./settings";

export type AuthResult =
  | { ok: true; userId: string; mustChangePassword: boolean }
  | { ok: false; reason: "INVALID" | "LOCKED" | "INACTIVE" | "RATE_LIMITED"; minutes?: number };

// Hash used to keep response time constant when the user does not exist.
let dummyHash: Promise<string> | null = null;

export async function authenticate(identifier: string, password: string, meta: { ip: string | null; userAgent: string | null }): Promise<AuthResult> {
  const settings = await getSettings();
  const id = identifier.trim().toLowerCase();
  const ipKey = `login:ip:${meta.ip ?? "unknown"}`;
  const idKey = `login:id:${id}`;
  const [ipOk, idOk] = [await consumeRateLimit(ipKey, 30, 15 * 60), await consumeRateLimit(idKey, 12, 15 * 60)];
  if (!ipOk || !idOk) return { ok: false, reason: "RATE_LIMITED" };

  const user = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email: { equals: id } }, { username: { equals: id } }] },
  });
  const pseudoActor = (u?: { id: string; fullName: string }) =>
    ({ id: u?.id ?? "system", name: u?.fullName ?? identifier.slice(0, 100), email: "", jobTitle: null, locale: "en", roles: [], permissions: new Set(), assignments: [], allMdas: false, approvedOnly: false, ip: meta.ip, userAgent: meta.userAgent }) as Actor;

  if (!user) {
    dummyHash ??= hashPassword("not-a-real-password-0000");
    await verifyPassword(password, await dummyHash);
    await audit(prisma, pseudoActor(), { action: "LOGIN_FAILED", entityType: "User", summary: `Failed sign-in for unknown account "${identifier.slice(0, 100)}"` });
    return { ok: false, reason: "INVALID" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    await audit(prisma, pseudoActor(user), { action: "LOGIN_FAILED", entityType: "User", entityId: user.id, summary: "Sign-in attempt on a locked account" });
    return { ok: false, reason: "LOCKED", minutes };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= settings.security.maxFailedLogins;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + settings.security.lockoutMinutes * 60_000) : null },
    });
    await audit(prisma, pseudoActor(user), {
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      summary: lock ? `Account locked for ${settings.security.lockoutMinutes} minutes after ${failed} failed attempts` : `Failed sign-in (${failed}/${settings.security.maxFailedLogins})`,
    });
    return lock ? { ok: false, reason: "LOCKED", minutes: settings.security.lockoutMinutes } : { ok: false, reason: "INVALID" };
  }
  if (!user.isActive) {
    await audit(prisma, pseudoActor(user), { action: "LOGIN_FAILED", entityType: "User", entityId: user.id, summary: "Sign-in attempt on an inactive account" });
    return { ok: false, reason: "INACTIVE" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit(prisma, pseudoActor(user), { action: "LOGIN", entityType: "User", entityId: user.id, summary: "Signed in" });
  return { ok: true, userId: user.id, mustChangePassword: user.mustChangePassword };
}

export async function changePassword(actor: Actor, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new ValidationFailedError("The current password is incorrect.", { currentPassword: ["Incorrect password"] });
  const settings = await getSettings();
  const problems = checkPasswordPolicy(next, { minLength: settings.security.passwordMinLength, requireUpper: true, requireLower: true, requireDigit: true, requireSymbol: false });
  if (problems.length) throw new ValidationFailedError(`The new password must contain ${problems.join(", ")}.`, { newPassword: problems });
  if (await verifyPassword(next, user.passwordHash)) throw new BusinessRuleError("The new password must be different from the current password.");
  await prisma.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false } });
  // Invalidate every existing session; the caller starts a fresh one for this device.
  await prisma.session.deleteMany({ where: { userId: actor.id } });
  await audit(prisma, actor, { action: "PASSWORD_CHANGE", entityType: "User", entityId: actor.id, summary: "Password changed" });
}

/** Details users may maintain themselves; name, e-mail, roles and MDAs are managed by administrators. */
export async function updateOwnProfile(actor: Actor, input: { phone: string | null; locale: "en" | "so" }) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { phone: true, locale: true } });
  await prisma.user.update({ where: { id: actor.id }, data: { phone: input.phone, locale: input.locale } });
  await audit(prisma, actor, { action: "UPDATE", entityType: "User", entityId: actor.id, summary: "Updated own profile", oldValue: before, newValue: input });
}

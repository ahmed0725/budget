"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { createSession, destroyOtherSessions, getActor } from "@/lib/auth/session";
import { AuthenticationError, ValidationFailedError } from "@/lib/errors";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { changePassword, updateOwnProfile } from "@/lib/services/auth";

async function signedIn() {
  // Password changes must remain possible while a temporary password is pending.
  const actor = await getActor();
  if (!actor) throw new AuthenticationError();
  return actor;
}

export async function changePasswordAction(input: unknown) {
  return runAction(async () => {
    const actor = await signedIn();
    const data = parseInput(z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: z.string().min(1, "Enter a new password").max(200), confirmPassword: z.string() }), input);
    if (data.newPassword !== data.confirmPassword) throw new ValidationFailedError("The new passwords do not match.", { confirmPassword: ["Does not match the new password"] });
    await changePassword(actor, data.currentPassword, data.newPassword);
    // Every session was ended by the change; continue on this device with a fresh one.
    await createSession(actor.id);
    return null;
  }, "Password changed. Other devices have been signed out.");
}

export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    const actor = await signedIn();
    const data = parseInput(z.object({ phone: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(50).nullable()), locale: z.enum(["en", "so"]) }), input);
    await updateOwnProfile(actor, data);
    const store = await cookies();
    store.set(LOCALE_COOKIE, data.locale, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 365, secure: process.env.SECURE_COOKIES === "true" });
    revalidatePath("/", "layout");
    return null;
  });
}

export async function signOutOtherSessionsAction() {
  return runAction(async () => {
    const actor = await signedIn();
    const count = await destroyOtherSessions(actor.id);
    revalidatePath("/profile");
    return { count };
  });
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { destroySession, getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { audit } from "@/lib/services/audit";

export async function logoutAction() {
  const actor = await getActor();
  if (actor) await audit(prisma, actor, { action: "LOGOUT", entityType: "User", entityId: actor.id, summary: "Signed out" });
  await destroySession();
  redirect("/login");
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 365, secure: process.env.SECURE_COOKIES === "true" });
  const actor = await getActor();
  if (actor) await prisma.user.update({ where: { id: actor.id }, data: { locale } });
  refresh();
}

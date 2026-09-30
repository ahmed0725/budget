"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, requestMeta } from "@/lib/auth/session";
import { createT } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { authenticate } from "@/lib/services/auth";

export interface LoginState {
  error?: string;
  identifier?: string;
}

const schema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/** Only allow same-site relative redirects after sign-in (no open redirects). */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) return "/dashboard";
  return next;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = createT(await getLocale());
  const parsed = schema.safeParse({ identifier: formData.get("identifier"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { error: t("auth.invalidCredentials") };
  const result = await authenticate(parsed.data.identifier, parsed.data.password, await requestMeta());
  if (!result.ok) {
    const message =
      result.reason === "LOCKED"
        ? t("auth.locked", { minutes: result.minutes ?? 15 })
        : result.reason === "INACTIVE"
          ? t("auth.inactive")
          : result.reason === "RATE_LIMITED"
            ? t("auth.rateLimited")
            : t("auth.invalidCredentials");
    return { error: message, identifier: parsed.data.identifier };
  }
  await createSession(result.userId);
  redirect(result.mustChangePassword ? "/profile?changePassword=1" : safeNext(parsed.data.next));
}

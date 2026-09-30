import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getActor } from "@/lib/auth/session";
import { getSettings } from "@/lib/services/settings";
import { createT, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** Locale for this request: explicit cookie → user preference → system default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const actor = await getActor();
  if (actor) return actor.locale;
  return (await getSettings()).defaultLocale;
});

export async function getT() {
  const locale = await getLocale();
  return { t: createT(locale), locale };
}

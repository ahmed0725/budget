"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/** Context filters persisted across pages (spec: filter persistence). */
export const CONTEXT_COOKIE = "gbms_ctx";
export const PERSISTED_KEYS = ["year", "mda"] as const;

export function persistContext(key: string, value: string | null) {
  if (!(PERSISTED_KEYS as readonly string[]).includes(key)) return;
  try {
    const current = Object.fromEntries(
      document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${CONTEXT_COOKIE}=`))
        ?.slice(CONTEXT_COOKIE.length + 1)
        .split("&")
        .map((p) => p.split("=").map(decodeURIComponent)) ?? [],
    );
    if (value) current[key] = value;
    else delete current[key];
    const encoded = Object.entries(current)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    document.cookie = `${CONTEXT_COOKIE}=${encoded}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
  } catch {
    // Cookie persistence is a convenience; ignore failures.
  }
}

/** Read/update URL search params; any filter change resets pagination. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = useCallback(
    (updates: Record<string, string | null | undefined>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
        persistContext(k, v ?? null);
      }
      if (opts.resetPage && !("page" in updates)) next.delete("page");
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  return { params, set, pending };
}

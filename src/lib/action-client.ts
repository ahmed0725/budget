"use client";

import { toast } from "sonner";
import type { ActionErrorPayload } from "@/lib/errors";

export type ClientActionResult<T> = { ok: true; data: T; message?: string } | { ok: false; error: ActionErrorPayload };

/** Show a server error with its details (e.g. the list of blocking validation errors). */
export function toastActionError(error: ActionErrorPayload) {
  toast.error(error.message, {
    description: error.details.length ? error.details.slice(0, 8).join("\n") : undefined,
    duration: error.details.length ? 12_000 : 6_000,
    className: "whitespace-pre-line",
  });
}

/**
 * Handle an action result: toast errors, optionally toast success. Returns the data on
 * success (or `true` for actions that return no data) and null on failure, so
 * `if (handleResult(...))` always means "succeeded".
 */
export function handleResult<T>(result: ClientActionResult<T>, success?: string): (T extends null | undefined ? true : T) | null {
  if (!result.ok) {
    toastActionError(result.error);
    return null;
  }
  if (success ?? result.message) toast.success(success ?? result.message);
  return (result.data ?? true) as T extends null | undefined ? true : T;
}

import "server-only";
import { unstable_rethrow } from "next/navigation";
import { toErrorPayload, type ActionErrorPayload } from "@/lib/errors";
import { ValidationFailedError } from "@/lib/errors";
import type { ZodType } from "zod";

export type ActionResult<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: ActionErrorPayload };

/** Run a server-action body and convert thrown errors into a user-facing payload. */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: toErrorPayload(err) };
  }
}

/** Parse untrusted input with a Zod schema, throwing a ValidationFailedError with field messages. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    const details: string[] = [];
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      (fieldErrors[path] ??= []).push(issue.message);
      details.push(path ? `${humanPath(issue.path)}: ${issue.message}` : issue.message);
    }
    throw new ValidationFailedError("Some fields need correction before saving.", fieldErrors, [...new Set(details)].slice(0, 20));
  }
  return result.data;
}

function humanPath(path: PropertyKey[]): string {
  return path
    .map((p) => (typeof p === "number" ? `row ${p + 1}` : String(p).replace(/([A-Z])/g, " $1").toLowerCase()))
    .join(" › ");
}

import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function readTableParams(sp: SearchParams, defaults: { pageSize?: number; sort?: string } = {}) {
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const pageSize = Math.min(500, Math.max(5, Number(param(sp, "pageSize")) || defaults.pageSize || 25));
  const sort = param(sp, "sort") ?? defaults.sort ?? null;
  return { page, pageSize, sort, q: param(sp, "q")?.trim() || undefined };
}

/** Context (year, MDA) remembered across pages. */
export async function getContext(): Promise<{ year?: number; mda?: string }> {
  const raw = (await cookies()).get("gbms_ctx")?.value;
  if (!raw) return {};
  const entries = Object.fromEntries(raw.split("&").map((p) => p.split("=").map(decodeURIComponent)));
  return { year: entries.year ? Number(entries.year) || undefined : undefined, mda: entries.mda || undefined };
}

export async function getBudgetYears() {
  return prisma.budgetYear.findMany({ orderBy: { year: "desc" } });
}

/**
 * Selected budget year: URL param → remembered context → year in preparation (for
 * preparation pages) or the year in execution (for execution/analysis pages).
 */
export async function resolveYear(sp: SearchParams, prefer: "preparation" | "execution" = "preparation"): Promise<number> {
  const fromUrl = Number(param(sp, "year"));
  if (fromUrl) return fromUrl;
  const ctx = await getContext();
  const years = await getBudgetYears();
  const executing = (status: string) => ["ACTIVE", "PUBLISHED", "CLOSED"].includes(status);
  // A remembered year only applies when it makes sense for the page (execution needs a published year).
  const remembered = ctx.year ? years.find((y) => y.year === ctx.year) : undefined;
  if (remembered && (prefer === "preparation" || executing(remembered.status))) return remembered.year;
  const pick =
    prefer === "preparation"
      ? years.find((y) => y.status === "PREPARATION" || y.status === "REVIEW") ?? years.find((y) => y.status === "ACTIVE")
      : years.find((y) => y.status === "ACTIVE") ?? years.find((y) => y.status === "PUBLISHED" || y.status === "CLOSED");
  return pick?.year ?? new Date().getFullYear();
}

export async function resolveMda(sp: SearchParams): Promise<string | undefined> {
  const fromUrl = param(sp, "mda");
  if (fromUrl !== undefined) return fromUrl || undefined;
  return (await getContext()).mda;
}

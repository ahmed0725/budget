import "server-only";
import { prisma } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by PostgreSQL (works across server instances).
 * Returns true when the request is allowed.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."resetAt" < ${now} THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE WHEN "rate_limits"."resetAt" < ${now} THEN ${resetAt} ELSE "rate_limits"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}

export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

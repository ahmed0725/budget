import "server-only";
import { prisma } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by the database (works across server instances).
 * Returns true when the request is allowed.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  // MySQL applies the assignments left to right, so `count` must be computed before
  // `resetAt` is overwritten. `key` is a reserved word, hence the backticks.
  await prisma.$executeRaw`
    INSERT INTO rate_limits (\`key\`, \`count\`, resetAt)
    VALUES (${key}, 1, ${resetAt})
    ON DUPLICATE KEY UPDATE
      \`count\` = IF(resetAt < ${now}, 1, \`count\` + 1),
      resetAt = IF(resetAt < ${now}, ${resetAt}, resetAt)`;
  const row = await prisma.rateLimit.findUnique({ where: { key }, select: { count: true } });
  return (row?.count ?? 1) <= limit;
}

export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

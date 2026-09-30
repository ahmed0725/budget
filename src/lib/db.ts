import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type Db = typeof prisma;
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run independent queries concurrently on the pooled client, but sequentially inside an
 * interactive transaction (a transaction owns a single connection).
 */
export async function parallel<T extends readonly (() => Promise<unknown>)[]>(
  client: Tx | Db,
  ...queries: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  if (client === prisma) return (await Promise.all(queries.map((q) => q()))) as never;
  const results: unknown[] = [];
  for (const q of queries) results.push(await q());
  return results as never;
}

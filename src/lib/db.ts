import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  // mysql://user:password@host:3306/database (MySQL 8+ or MariaDB 10.4+).
  const adapter = new PrismaMariaDb(connectionString);
  return new PrismaClient({ adapter });
}

type Client = ReturnType<typeof createClient>;

// One client per process (kept on globalThis so development hot reloads reuse it).
const globalForPrisma = globalThis as unknown as { prisma?: Client };

function client(): Client {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * The database client, created on first use: importing this module never needs
 * DATABASE_URL, so builds can load route modules without database settings.
 */
export const prisma: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

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

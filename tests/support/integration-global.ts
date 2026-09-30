/**
 * Integration test global setup.
 *
 * Every run creates a fresh, uniquely named database on the server of
 * TEST_DATABASE_URL (e.g. gbms_test_1759140000000), applies the migrations with the
 * non-destructive `prisma migrate deploy`, loads the full seed (system configuration,
 * reference data from the budget workbook and the development data set) and drops that
 * database — and only that one — when the run ends. Existing databases are never reset.
 *
 * TEST_DB_REUSE=true runs against TEST_DATABASE_URL itself (migrations applied, no
 * seed, nothing dropped) — useful when iterating on a single test locally.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function withDatabase(url: string, database: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export default async function setup(project: TestProject) {
  dotenv.config({ quiet: true });
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not configured (see .env.example)");
  if (base === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  const storage = path.resolve(".data/test-storage");
  rmSync(storage, { recursive: true, force: true });

  if (process.env.TEST_DB_REUSE === "true") {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: base }, stdio: "inherit" });
    project.provide("databaseUrl", base);
    return;
  }

  const name = `gbms_test_${Date.now()}`;
  const admin = new pg.Client({ connectionString: withDatabase(base, "postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const url = withDatabase(base, name);
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: storage };
  const started = Date.now();
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "inherit" });
  console.log(`Test database ${name} ready in ${Math.round((Date.now() - started) / 1000)}s`);
  project.provide("databaseUrl", url);

  return async () => {
    const c = new pg.Client({ connectionString: withDatabase(base, "postgres") });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await c.end();
  };
}

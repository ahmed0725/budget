/**
 * Integration test global setup.
 *
 * Every run creates a fresh, uniquely named database on the server of
 * TEST_DATABASE_URL (e.g. gbms_test_1759140000000) and prepares it exactly like a
 * deployment does (scripts/db-deploy.mjs: non-destructive `prisma migrate deploy`, the
 * integrity triggers and the full seed — system configuration, reference data from the
 * budget workbook and the development data set). That database — and only that one —
 * is dropped when the run ends. Existing databases are never reset.
 *
 * TEST_DB_REUSE=true runs against TEST_DATABASE_URL itself (migrations applied, no
 * seed, nothing dropped) — useful when iterating on a single test locally.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { TestProject } from "vitest/node";
import { withConnection, withDatabase } from "../../scripts/mysql.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
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
  const server = withDatabase(base, "");
  await withConnection(server, (c) => c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`));
  const url = withDatabase(base, name);
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: storage, DEPLOY_DB_SETUP: "" };
  const started = Date.now();
  execSync("node scripts/db-deploy.mjs", { env, stdio: "inherit" });
  console.log(`Test database ${name} ready in ${Math.round((Date.now() - started) / 1000)}s`);
  project.provide("databaseUrl", url);

  return async () => {
    await withConnection(server, (c) => c.query(`DROP DATABASE IF EXISTS \`${name}\``));
  };
}

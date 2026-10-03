/**
 * Prepare the database of a deployment (MySQL 8+ / MariaDB 10.4+):
 *   1. apply pending migrations (`prisma migrate deploy`, non-destructive);
 *   2. install the integrity triggers (prisma/sql/integrity.mjs) — a warning only if
 *      the host does not allow CREATE TRIGGER;
 *   3. on a fresh database only, load the seed — system configuration, reference data
 *      and, unless SEED_SKIP_DEV=true, the demo data set and demo accounts (password
 *      from SEED_DEV_PASSWORD).
 * Existing data is never reset, so it is safe to run on every deployment.
 */
import { execSync } from "node:child_process";
import "dotenv/config";
import { applyIntegrity } from "../prisma/sql/integrity.mjs";
import { databaseName, withConnection, withDatabase } from "./mysql.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot prepare the database.");
  process.exit(1);
}
if (!/^mysql:\/\//.test(url)) {
  console.error("DATABASE_URL must be a MySQL/MariaDB connection string: mysql://USER:PASSWORD@HOST:3306/DATABASE");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

const database = databaseName(url);
await withConnection(withDatabase(url, ""), async (c) => {
  console.log(`▶ Database server: ${(await c.query("SELECT VERSION() AS v"))[0].v}`);
  // Hosting panels create the database up front; locally, create it when missing.
  const exists = (await c.query("SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [database])).length > 0;
  if (!exists) {
    await c.query(`CREATE DATABASE \`${database.replace(/`/g, "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✓ Created database ${database}`);
  }
});

console.log("▶ Applying database migrations");
run("npx prisma migrate deploy");

console.log("▶ Installing integrity triggers");
const integrity = await withConnection(url, (c) => applyIntegrity(c));
if (integrity.error) {
  console.warn(`⚠ Integrity triggers could not be installed (${integrity.error}).`);
  console.warn("  The application still enforces locking of approved budgets and the append-only audit trail;");
  console.warn("  the database-level safeguard is just not active on this host.");
} else {
  console.log(`✓ ${integrity.applied} integrity triggers installed`);
}

const years = await withConnection(url, async (c) => Number((await c.query("SELECT COUNT(*) AS n FROM budget_years"))[0].n));
if (years > 0) {
  console.log("✓ Database already initialised — seed skipped.");
} else {
  // On a server (DEPLOY_DB_SETUP=true) the demo accounts must get a private password.
  if (process.env.DEPLOY_DB_SETUP === "true" && process.env.SEED_SKIP_DEV !== "true" && !process.env.SEED_DEV_PASSWORD) {
    console.error("SEED_DEV_PASSWORD must be set so the demo accounts get a private password (or set SEED_SKIP_DEV=true to load no demo data).");
    process.exit(1);
  }
  console.log("▶ Fresh database — loading seed data");
  run("npx tsx --conditions=react-server prisma/seed.ts");
}

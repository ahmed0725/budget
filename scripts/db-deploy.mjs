/**
 * Prepare the database of a deployment:
 *   1. apply pending migrations (`prisma migrate deploy`, non-destructive);
 *   2. on a fresh database only, load the seed — system configuration, reference data
 *      and, unless SEED_SKIP_DEV=true, the demo data set and demo accounts (password
 *      from SEED_DEV_PASSWORD).
 * Existing data is never reset, so it is safe to run on every deployment.
 */
import { execSync } from "node:child_process";
import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — cannot prepare the database.");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

console.log("▶ Applying database migrations");
run("npx prisma migrate deploy");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM budget_years");
await client.end();

if (rows[0].n > 0) {
  console.log("✓ Database already initialised — seed skipped.");
} else {
  if (process.env.SEED_SKIP_DEV !== "true" && !process.env.SEED_DEV_PASSWORD) {
    console.error("SEED_DEV_PASSWORD must be set so the demo accounts get a private password (or set SEED_SKIP_DEV=true to load no demo data).");
    process.exit(1);
  }
  console.log("▶ Fresh database — loading seed data");
  run("npx tsx --conditions=react-server prisma/seed.ts");
}

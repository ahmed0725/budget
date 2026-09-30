/**
 * End-to-end test runner.
 *
 * 1. Creates a fresh database (gbms_e2e_<timestamp>) on the server of TEST_DATABASE_URL,
 *    applies the migrations (non-destructive `prisma migrate deploy`) and loads the full
 *    seed with a random development password that exists only for this run.
 * 2. Runs Playwright, which starts the production build (`next start`) against that
 *    database (run `npm run build` first).
 * 3. Drops the database it created — and only that one.
 *
 * Extra arguments are passed to Playwright, e.g. `npm run test:e2e -- --headed`.
 */
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error("TEST_DATABASE_URL is not configured (see .env.example)");
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const withDb = (url, db) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const name = `gbms_e2e_${Date.now()}`;
const url = withDb(base, name);
const password = `E2e-${crypto.randomBytes(9).toString("base64url")}7a`;
const storage = path.resolve(".data/e2e-storage");

const admin = async (sql) => {
  const c = new pg.Client({ connectionString: withDb(base, "postgres") });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
};

let status = 1;
await admin(`CREATE DATABASE "${name}"`);
try {
  rmSync(storage, { recursive: true, force: true });
  mkdirSync(".data", { recursive: true });
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: storage, SEED_DEV_PASSWORD: password };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { env, stdio: "inherit" });
  writeFileSync(".data/e2e.json", JSON.stringify({ databaseUrl: url, storage }));
  const run = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env: { ...env, E2E_DATABASE_URL: url, E2E_PASSWORD: password } });
  status = run.status ?? 1;
} finally {
  rmSync(".data/e2e.json", { force: true });
  await admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}
process.exit(status);

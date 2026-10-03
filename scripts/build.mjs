/**
 * Production build.
 *
 * - Checks the required settings first, so a missing variable fails immediately with
 *   a clear message instead of deep inside the build (skip with SKIP_ENV_CHECK=true).
 * - On hosts without shell access (e.g. Hostinger Node.js web apps) set
 *   DEPLOY_DB_SETUP=true so the build also applies migrations and, on a fresh
 *   database, loads the seed (see scripts/db-deploy.mjs).
 * - Next's native compiler (and Turbopack) needs glibc 2.29 or later on Linux. On older
 *   systems Next falls back to its WebAssembly compiler, which only supports webpack, so
 *   the build switches to `next build --webpack` automatically. Force either bundler
 *   with NEXT_BUNDLER=webpack or NEXT_BUNDLER=turbopack.
 */
import { execSync } from "node:child_process";
import "dotenv/config";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

function checkEnvironment() {
  if (process.env.SKIP_ENV_CHECK === "true") return;
  const env = (k) => process.env[k]?.trim() ?? "";
  const problems = [];
  if (!env("DATABASE_URL")) problems.push("DATABASE_URL is missing");
  else if (!/^mysql:\/\//.test(env("DATABASE_URL"))) problems.push("DATABASE_URL must start with mysql://");
  if (!env("AUTH_SECRET")) problems.push("AUTH_SECRET is missing");
  else if (env("AUTH_SECRET").length < 32) problems.push("AUTH_SECRET is too short (use at least 32 random characters)");
  if (process.env.DEPLOY_DB_SETUP === "true" && process.env.SEED_SKIP_DEV !== "true") {
    if (!env("SEED_DEV_PASSWORD")) problems.push("SEED_DEV_PASSWORD is missing");
    else if (env("SEED_DEV_PASSWORD").length < 10) problems.push("SEED_DEV_PASSWORD is too short (use at least 10 characters)");
  }
  if (problems.length === 0) return;
  console.error(`
✖ Environment settings need attention:
${problems.map((p) => `    - ${p}`).join("\n")}

  On Hostinger, set them in hPanel → your Node.js app → Settings / Environment variables,
  then redeploy:

    DATABASE_URL        mysql://USER:PASSWORD@localhost:3306/DATABASE
                        (hPanel → Databases → MySQL; URL-encode special characters
                        in the password, e.g. @ → %40, # → %23)
    AUTH_SECRET         a long random value, at least 32 characters — not a password
    SEED_DEV_PASSWORD   private password for the demo accounts, at least 10 characters
    DEPLOY_DB_SETUP     true   (creates the tables and demo data on the first deploy)
    SECURE_COOKIES      true   (the site is served over HTTPS)

  See DEPLOYMENT.md for the full list.
`);
  process.exit(1);
}

function glibcTooOld() {
  if (process.platform !== "linux") return false;
  const version = process.report?.getReport()?.header?.glibcVersionRuntime;
  if (!version) return true; // musl or unknown libc: no compatible native binary shipped
  const [major, minor] = version.split(".").map(Number);
  return major < 2 || (major === 2 && minor < 29);
}

checkEnvironment();
const bundler = process.env.NEXT_BUNDLER ?? (glibcTooOld() || process.env.NEXT_TEST_WASM ? "webpack" : "turbopack");

try {
  if (process.env.DEPLOY_DB_SETUP === "true") run("node scripts/db-deploy.mjs");
  else console.log("ℹ DEPLOY_DB_SETUP is not \"true\": database migrations and seed data are not applied by this build.");
  if (bundler === "webpack") console.log("▶ Building with webpack (native Next.js compiler unavailable on this system)");
  run(`npx next build${bundler === "webpack" ? " --webpack" : ""}`);
} catch (e) {
  process.exit(typeof e.status === "number" ? e.status : 1);
}

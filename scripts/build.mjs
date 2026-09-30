/**
 * Production build. On hosting platforms without shell access (e.g. Hostinger Node.js
 * web apps) set DEPLOY_DB_SETUP=true so the build also applies migrations and, on a
 * fresh database, loads the seed (see scripts/db-deploy.mjs).
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

try {
  if (process.env.DEPLOY_DB_SETUP === "true") run("node scripts/db-deploy.mjs");
  run("npx next build");
} catch (e) {
  process.exit(typeof e.status === "number" ? e.status : 1);
}

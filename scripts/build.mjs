/**
 * Production build.
 *
 * - On hosts without shell access (e.g. Hostinger Node.js web apps) set
 *   DEPLOY_DB_SETUP=true so the build also applies migrations and, on a fresh
 *   database, loads the seed (see scripts/db-deploy.mjs).
 * - Next's native compiler (and Turbopack) needs glibc 2.29 or later on Linux. On older
 *   systems Next falls back to its WebAssembly compiler, which only supports webpack, so
 *   the build switches to `next build --webpack` automatically. Force either bundler
 *   with NEXT_BUNDLER=webpack or NEXT_BUNDLER=turbopack.
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

function glibcTooOld() {
  if (process.platform !== "linux") return false;
  const version = process.report?.getReport()?.header?.glibcVersionRuntime;
  if (!version) return true; // musl or unknown libc: no compatible native binary shipped
  const [major, minor] = version.split(".").map(Number);
  return major < 2 || (major === 2 && minor < 29);
}

const bundler = process.env.NEXT_BUNDLER ?? (glibcTooOld() || process.env.NEXT_TEST_WASM ? "webpack" : "turbopack");

try {
  if (process.env.DEPLOY_DB_SETUP === "true") run("node scripts/db-deploy.mjs");
  if (bundler === "webpack") console.log("▶ Building with webpack (native Next.js compiler unavailable on this system)");
  run(`npx next build${bundler === "webpack" ? " --webpack" : ""}`);
} catch (e) {
  process.exit(typeof e.status === "number" ? e.status : 1);
}

#!/usr/bin/env node
/**
 * Local PostgreSQL helper for development and tests.
 *
 * Uses the PostgreSQL binaries shipped by the `embedded-postgres` npm package so
 * no system-wide PostgreSQL installation is required. In production, point
 * DATABASE_URL at a managed PostgreSQL server instead and do not use this script.
 *
 *   node scripts/db.mjs start    initialise (first run) and start a detached server
 *   node scripts/db.mjs stop     stop the server
 *   node scripts/db.mjs status   show server status
 *   node scripts/db.mjs ensure   start if needed and make sure the app + test databases exist
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import "dotenv/config";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dataDir = path.join(root, ".data", "postgres");
const logFile = path.join(root, ".data", "postgres.log");

const url = new URL(process.env.DATABASE_URL ?? "postgresql://gbms:gbms_dev_password@localhost:54329/gbms");
const testUrl = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);

function platformPackage() {
  const map = {
    "win32-x64": "@embedded-postgres/windows-x64",
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "linux-arm64": "@embedded-postgres/linux-arm64",
  };
  const key = `${process.platform}-${process.arch}`;
  if (!map[key]) throw new Error(`No embedded PostgreSQL binaries for ${key}. Install PostgreSQL and set DATABASE_URL.`);
  return map[key];
}

async function binaries() {
  return import(platformPackage());
}

function run(bin, args, opts = {}) {
  const res = spawnSync(bin, args, { encoding: "utf8", env: { ...process.env, PGPASSWORD: password }, ...opts });
  return res;
}

async function isRunning() {
  const { pg_ctl } = await binaries();
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) return false;
  const res = run(pg_ctl, ["status", "-D", dataDir]);
  return res.status === 0;
}

async function init() {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) return;
  const { initdb } = await binaries();
  mkdirSync(dataDir, { recursive: true });
  const pwFile = path.join(os.tmpdir(), `gbms-pw-${process.pid}`);
  writeFileSync(pwFile, password + "\n");
  console.log(`Initialising PostgreSQL data directory at ${dataDir}`);
  const res = run(initdb, [
    `--pgdata=${dataDir}`,
    `--auth=scram-sha-256`,
    `--username=${user}`,
    `--pwfile=${pwFile}`,
    "--encoding=UTF8",
    "--locale=C",
  ]);
  rmSync(pwFile, { force: true });
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr);
    throw new Error("initdb failed");
  }
}

async function start() {
  await init();
  if (await isRunning()) {
    console.log(`PostgreSQL already running on port ${port}`);
    return;
  }
  const { pg_ctl } = await binaries();
  const res = run(pg_ctl, ["start", "-w", "-D", dataDir, "-l", logFile, "-o", `-p ${port} -c listen_addresses=localhost`], {
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  if (res.status !== 0) {
    throw new Error(`pg_ctl start failed. See ${logFile}`);
  }
  console.log(`PostgreSQL started on port ${port} (data: ${dataDir})`);
}

async function stop() {
  if (!(await isRunning())) {
    console.log("PostgreSQL is not running");
    return;
  }
  const { pg_ctl } = await binaries();
  const res = run(pg_ctl, ["stop", "-w", "-D", dataDir, "-m", "fast"]);
  if (res.status !== 0) throw new Error(res.stderr || "pg_ctl stop failed");
  console.log("PostgreSQL stopped");
}

async function ensureDatabases() {
  const pg = (await import("pg")).default;
  const admin = new pg.Client({ host: url.hostname, port, user, password, database: "postgres" });
  await admin.connect();
  const names = [url.pathname.slice(1)];
  if (testUrl) names.push(testUrl.pathname.slice(1));
  for (const name of names) {
    if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Refusing unsafe database name: ${name}`);
    const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (exists.rowCount === 0) {
      await admin.query(`create database "${name}"`);
      console.log(`Created database ${name}`);
    }
  }
  await admin.end();
}

const cmd = process.argv[2] ?? "status";
try {
  if (cmd === "start") await start();
  else if (cmd === "stop") await stop();
  else if (cmd === "status") console.log((await isRunning()) ? `running on port ${port}` : "stopped");
  else if (cmd === "ensure") {
    await start();
    await ensureDatabases();
  } else {
    console.error(`Unknown command ${cmd}`);
    process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

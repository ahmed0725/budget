/**
 * Local development database helper (MySQL / MariaDB, e.g. the one in XAMPP).
 *
 *   node scripts/db.mjs status   — show whether the server in DATABASE_URL is reachable
 *   node scripts/db.mjs ensure   — start XAMPP's MariaDB when it is not running
 *
 * The XAMPP folder is detected (C:\xampp1, C:\xampp) or taken from XAMPP_DIR.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import "dotenv/config";
import { withConnection, withDatabase } from "./mysql.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}
const { hostname, port } = new URL(url);
const host = hostname || "localhost";
const tcpPort = Number(port || 3306);

const reachable = () =>
  new Promise((resolve) => {
    const s = net.connect({ host, port: tcpPort, timeout: 1500 }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });

async function serverVersion() {
  return withConnection(withDatabase(url, ""), async (c) => (await c.query("SELECT VERSION() AS v"))[0].v);
}

function xamppDir() {
  const candidates = [process.env.XAMPP_DIR, "C:\\xampp1", "C:\\xampp", "/opt/lampp"].filter(Boolean);
  return candidates.find((d) => existsSync(path.join(d, "mysql", "bin", process.platform === "win32" ? "mysqld.exe" : "mysqld")));
}

const command = process.argv[2] ?? "status";

if (command === "status") {
  if (await reachable()) console.log(`MySQL/MariaDB is running on ${host}:${tcpPort} (${await serverVersion()})`);
  else console.log(`stopped — nothing is listening on ${host}:${tcpPort}`);
} else if (command === "ensure") {
  if (await reachable()) {
    console.log(`MySQL/MariaDB is running on ${host}:${tcpPort} (${await serverVersion()})`);
  } else if (!["localhost", "127.0.0.1"].includes(host)) {
    console.error(`Cannot reach ${host}:${tcpPort}. Start that database server, then retry.`);
    process.exit(1);
  } else {
    const dir = xamppDir();
    if (!dir) {
      console.error("MySQL/MariaDB is not running and no XAMPP installation was found. Start your MySQL server (or set XAMPP_DIR), then retry.");
      process.exit(1);
    }
    const bin = path.join(dir, "mysql", "bin", process.platform === "win32" ? "mysqld.exe" : "mysqld");
    const ini = path.join(dir, "mysql", "bin", "my.ini");
    const args = existsSync(ini) ? [`--defaults-file=${ini}`, "--standalone"] : ["--standalone"];
    spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 30 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!(await reachable())) {
      console.error("MariaDB did not start within 30 seconds. Start MySQL from the XAMPP Control Panel instead.");
      process.exit(1);
    }
    console.log(`Started XAMPP MariaDB on ${host}:${tcpPort} (${await serverVersion()})`);
  }
} else {
  console.error("Usage: node scripts/db.mjs status|ensure");
  process.exit(1);
}

/** Small helpers for scripts that talk to MySQL/MariaDB directly (mariadb driver). */
import mariadb from "mariadb";

/**
 * Connection options for the mariadb driver from a Prisma-style mysql:// URL (the driver's
 * own URL parser needs a database name and the mariadb:// scheme).
 * @param {string} url
 */
export function connectionOptions(url) {
  const u = new URL(url);
  const database = databaseName(url);
  return {
    host: decodeURIComponent(u.hostname) || "localhost",
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password) || undefined,
    ...(database ? { database } : {}),
    multipleStatements: false,
  };
}

/**
 * The same server URL pointing at another database ("" for no database).
 * @param {string} url
 * @param {string} database
 */
export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** @param {string} url */
export function databaseName(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/** @param {string} url */
export async function connect(url) {
  return mariadb.createConnection(connectionOptions(url));
}

/**
 * Run `fn` with a connection, always closing it.
 * @template T
 * @param {string} url
 * @param {(conn: import("mariadb").Connection) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withConnection(url, fn) {
  const conn = await connect(url);
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

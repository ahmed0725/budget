/** Run an ad hoc SQL query against DATABASE_URL and print the rows: node scripts/sql.mjs "SELECT …" */
import "dotenv/config";
import { withConnection } from "./mysql.mjs";

const rows = await withConnection(process.env.DATABASE_URL, (c) => c.query(process.argv[2]));
console.table(Array.isArray(rows) ? rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))) : rows);

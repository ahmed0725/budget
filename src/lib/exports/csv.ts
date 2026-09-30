/**
 * RFC 4180 CSV with a UTF-8 byte-order mark so Excel opens Somali text correctly.
 * Cells that could be interpreted as formulas are prefixed to prevent CSV injection.
 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v) : String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

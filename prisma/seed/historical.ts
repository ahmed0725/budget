/**
 * Historical budgets (2024–2026) loaded from "Final Draft Budget 2027.xlsx" through
 * the real import pipeline (parse → resolve → commit), recorded as an Import with
 * one import_row per source row.
 *
 * DEVELOPMENT SEED DATA: the workbook contains 2025 expenditure only as
 * government-wide totals (Shaxda 1.1). To enable per-MDA multi-year analysis in
 * development, those 2025 totals are distributed across MDAs in proportion to their
 * 2026 approved budgets (Shaxda 2.1). These lines are marked source = DEV_SEED.
 */
import crypto from "node:crypto";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { systemActor } from "../../src/lib/auth/actor";
import { ALL_PERMISSIONS } from "../../src/lib/auth/permissions";
import { toAmount } from "../../src/lib/calculations/money";
import { commitBudgetEntries, loadReferenceIndex, resolveEntries } from "../../src/lib/imports/budget-commit";
import { parseBudgetWorkbook, type BudgetWorkbookOptions } from "../../src/lib/imports/profiles/budget-workbook";
import { countRows, deriveStatus, type BudgetEntry, type ParsedRow } from "../../src/lib/imports/types";

export async function seedHistorical(prisma: PrismaClient, file: { path: string; buffer: Buffer }, wbOptions: BudgetWorkbookOptions, wb: Parameters<typeof parseBudgetWorkbook>[0], adminId: string) {
  const options: BudgetWorkbookOptions = { ...wbOptions, years: wbOptions.years.map((y) => ({ ...y, target: y.year <= 2026 ? "APPROVED" : "SKIP" })) };
  const parsed = parseBudgetWorkbook(wb, options);
  const rows = parsed.rows;

  // ── DEV SEED: 2025 per-MDA expenditure derived from government-wide totals ──
  const summary2025 = new Map<string, number>(); // legacy code → 2025 total
  for (const r of rows) {
    const role = options.sheets.find((s) => s.name === r.sheetName)?.role;
    if (role === "SUMMARY" && r.data.code && r.data.code.length === 4 && r.data.code.startsWith("2")) {
      const v = Number((r.data.amounts as Record<string, number | null>)?.["2025"] ?? 0);
      if (v) summary2025.set(r.data.code, v);
    }
  }
  const mdaShares = new Map<string, Map<string, number>>(); // legacy code → mda → 2026 amount
  for (const r of rows) {
    for (const e of r.data.entries ?? []) {
      if (e.year !== 2026 || !e.scheme) continue;
      const m = mdaShares.get(e.sourceCode) ?? new Map<string, number>();
      m.set(e.mdaCode, (m.get(e.mdaCode) ?? 0) + e.amount);
      mdaShares.set(e.sourceCode, m);
    }
  }
  const synthetic = new Map<string, BudgetEntry[]>();
  for (const [code, total] of summary2025) {
    // Codes without their own summary column were folded into "Kharashyada kale" (2261) in 2026.
    const shares = mdaShares.get(code) ?? mdaShares.get("2261");
    if (!shares) continue;
    const base = [...shares.values()].reduce((a, b) => a + b, 0);
    let allocated = 0;
    const entries = [...shares.entries()].sort();
    entries.forEach(([mda, amount], i) => {
      const value = i === entries.length - 1 ? toAmount(total - allocated) : toAmount((total * amount) / base);
      allocated = toAmount(allocated + value);
      if (value <= 0) return;
      const list = synthetic.get(mda) ?? [];
      list.push({ year: 2025, kind: "EXPENDITURE", mdaCode: mda, sourceCode: code, scheme: options.codeScheme, amount: value, description: `DEV SEED — share of 2025 total for code ${code}`, sourceRef: "DEV SEED: Shaxda 1.1 (2025) distributed by 2026 MDA shares", source: "DEV_SEED" });
      synthetic.set(mda, list);
    });
  }
  const devRows: ParsedRow[] = [...synthetic.entries()].map(([mda, entries], i) => ({
    sheetName: "DEV SEED (2025 distribution)",
    rowNumber: i + 1,
    raw: { mda },
    data: { role: "line", mdaCode: mda, entries },
    issues: [{ severity: "INFO", code: "DEV_SEED", message: "Development seed data — 2025 per-MDA split derived from government-wide totals" }],
    status: "VALID",
  }));
  devRows.forEach((r) => (r.status = deriveStatus(r)));

  // ── Store the source file like an uploaded import ───────────────────────────
  const storageDir = path.resolve(process.env.STORAGE_DIR ?? "./storage", "imports");
  mkdirSync(storageDir, { recursive: true });
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const storagePath = path.join(storageDir, `${hash}.xlsx`);
  copyFileSync(file.path, storagePath);

  const actor = systemActor(ALL_PERMISSIONS);
  const imp = await prisma.import.create({
    data: {
      profile: "budget-workbook",
      fileName: path.basename(file.path),
      fileSize: statSync(file.path).size,
      fileHash: hash,
      storagePath,
      status: "VALIDATED",
      options: options as object,
      detected: { sheets: options.sheets, notes: parsed.sheetNotes } as object,
      createdById: adminId,
      validatedAt: new Date(),
    },
  });

  const allRows = [...rows, ...devRows];
  const index = await loadReferenceIndex(prisma);
  resolveEntries(allRows, index, options);
  const before = countRows(allRows);

  const commit = await prisma.$transaction(
    async (tx) => commitBudgetEntries(tx, actor, allRows, { ...options, label: `${path.basename(file.path)} (initial data load)` }),
    { timeout: 600_000, maxWait: 60_000 },
  );

  // Persist import rows (chunked) with their final statuses.
  const data = rows.map((r) => ({
    importId: imp.id,
    sheetName: r.sheetName,
    rowNumber: r.rowNumber,
    raw: r.raw as object,
    data: JSON.parse(JSON.stringify(r.data)) as object,
    status: r.status,
    issues: r.issues as unknown as object,
  }));
  for (let i = 0; i < data.length; i += 500) await prisma.importRow.createMany({ data: data.slice(i, i + 500) });

  await prisma.import.update({
    where: { id: imp.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      summary: { counts: countRows(rows), before, commit, result: commit, reconciliation: parsed.reconciliation, devSeedRows: devRows.length } as object,
    },
  });
  await prisma.auditLog.create({
    data: { userId: adminId, userName: "System (seed)", action: "IMPORT", entityType: "Import", entityId: imp.id, summary: `Initial data load from ${path.basename(file.path)}: ${commit.submissionsCreated} budgets, ${commit.linesWritten} lines` },
  });
  return { importId: imp.id, counts: before, commit, reconciliation: parsed.reconciliation };
}

/**
 * Excel import wizard: Upload → Detect → Map → Validate → Preview → Import → Summary.
 *
 * The uploaded file is stored outside the public folder. Every validation run stores
 * one import_row per source row with its issues, so the preview, corrections and the
 * final summary are reproducible. Only VALID and WARNING rows are committed, inside a
 * single transaction; nothing is written when the commit fails.
 */
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportRowStatus, Prisma } from "@/generated/prisma/client";
import { can, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import { getProfile, type ImportProfile, type ProfileContext } from "@/lib/imports/profiles";
import { countRows, type ParsedRow, type RowIssue } from "@/lib/imports/types";
import { readCsv, readWorkbook, type WorkbookData } from "@/lib/imports/workbook";
import { audit, jsonSafe } from "./audit";
import { signatureMatches, storageRoot } from "./attachments";

export const MAX_IMPORT_MB = 25;

function need(actor: Actor, profile: ImportProfile<unknown>) {
  if (!can(actor, profile.permission)) {
    throw new AuthorizationError(`You do not have permission to run the "${profile.label.en}" import.`);
  }
}

async function profileContext(): Promise<ProfileContext> {
  const [prep, exec, revenue] = await Promise.all([
    prisma.budgetYear.findFirst({ where: { status: { in: ["PREPARATION", "DRAFT"] } }, orderBy: [{ status: "desc" }, { year: "asc" }] }),
    prisma.budgetYear.findFirst({ where: { status: "ACTIVE" }, orderBy: { year: "desc" } }),
    // The MDA that has carried consolidated revenue in approved budgets.
    prisma.budgetSubmission.findFirst({ where: { status: { in: ["APPROVED", "PUBLISHED"] }, totalRevenue: { gt: 0 } }, orderBy: [{ totalRevenue: "desc" }], select: { mda: { select: { code: true } } } }),
  ]);
  return { preparationYear: prep?.year ?? null, executionYear: exec?.year ?? null, revenueMdaCode: revenue?.mda.code ?? "" };
}

async function loadFile(imp: { storagePath: string; fileName: string }): Promise<WorkbookData> {
  const full = path.resolve(storageRoot(), imp.storagePath);
  const bytes = await readFile(/*turbopackIgnore: true*/ full);
  if (imp.fileName.toLowerCase().endsWith(".csv")) return readCsv(bytes.toString("utf8").replace(/^﻿/, ""), path.basename(imp.fileName, ".csv"));
  return readWorkbook(bytes);
}

function toParsed(r: { sheetName: string; rowNumber: number; raw: unknown; data: unknown; issues: unknown; status: ImportRowStatus }): ParsedRow {
  return { sheetName: r.sheetName, rowNumber: r.rowNumber, raw: r.raw as ParsedRow["raw"], data: r.data as ParsedRow["data"], issues: (r.issues as RowIssue[]) ?? [], status: r.status };
}

function rowData(importId: string, r: ParsedRow) {
  return {
    importId,
    sheetName: r.sheetName,
    rowNumber: r.rowNumber,
    raw: r.raw as Prisma.InputJsonValue,
    data: JSON.parse(JSON.stringify(r.data)) as Prisma.InputJsonValue,
    status: r.status,
    issues: r.issues as unknown as Prisma.InputJsonValue,
  };
}

/** Rows that carry nothing to import (headers, totals) are stored only when they have issues. */
function worthStoring(r: ParsedRow) {
  return r.data.role === "line" || r.issues.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload & detect
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadImport(actor: Actor, input: { profile: string; file: File }) {
  const profile = getProfile(input.profile);
  need(actor, profile);
  const name = path.basename(input.file.name);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!profile.accepts.includes(ext as "xlsx" | "csv")) {
    throw new ValidationFailedError(`"${name}" cannot be used for this import. Accepted file types: ${profile.accepts.map((a) => `.${a}`).join(", ")}.`, { file: ["Wrong file type"] });
  }
  if (input.file.size === 0) throw new ValidationFailedError("The file is empty.", { file: ["Empty file"] });
  if (input.file.size > MAX_IMPORT_MB * 1024 * 1024) throw new ValidationFailedError(`The file is larger than ${MAX_IMPORT_MB} MB.`, { file: ["Too large"] });
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (!signatureMatches(ext, bytes)) throw new ValidationFailedError(`The file content does not match a .${ext} file. Save it again from Excel and retry.`, { file: ["Invalid content"] });
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");

  let wb: WorkbookData;
  try {
    wb = ext === "csv" ? readCsv(Buffer.from(bytes).toString("utf8").replace(/^﻿/, ""), path.basename(name, ".csv")) : await readWorkbook(Buffer.from(bytes));
  } catch (e) {
    throw new ValidationFailedError(`The file could not be read: ${(e as Error).message}. Make sure it is a valid, unprotected Excel workbook.`);
  }
  if (!wb.sheets.some((s) => s.rows.length > 0)) throw new ValidationFailedError("The file does not contain any data.");

  const ctx = await profileContext();
  const detection = await profile.detect(wb, ctx);
  const previous = await prisma.import.findFirst({ where: { fileHash: hash, profile: profile.key, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } });

  const dir = path.join(storageRoot(), "imports", String(new Date().getUTCFullYear()));
  await mkdir(dir, { recursive: true });
  const stored = path.join(dir, `${crypto.randomUUID()}.${ext}`);
  await writeFile(stored, bytes);

  const imp = await prisma.$transaction(async (tx) => {
    const created = await tx.import.create({
      data: {
        profile: profile.key,
        fileName: name,
        fileSize: input.file.size,
        fileHash: hash,
        storagePath: path.relative(storageRoot(), stored),
        status: "UPLOADED",
        options: detection.options as Prisma.InputJsonValue,
        detected: {
          ...(detection.detected as object),
          confidence: detection.confidence,
          sheetNames: wb.sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
          previousImport: previous ? { id: previous.id, at: previous.createdAt.toISOString() } : null,
        } as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });
    await audit(tx, actor, { action: "IMPORT", entityType: "Import", entityId: created.id, summary: `Uploaded ${name} for import (${profile.label.en})` });
    return created;
  });
  return imp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map & validate
// ─────────────────────────────────────────────────────────────────────────────

async function editableImport(actor: Actor, id: string) {
  const imp = await prisma.import.findUnique({ where: { id } });
  if (!imp) throw new NotFoundError("import");
  const profile = getProfile(imp.profile);
  need(actor, profile);
  if (imp.createdById !== actor.id && !can(actor, "admin.settings.manage")) throw new AuthorizationError("Only the person who uploaded the file (or an administrator) can continue this import.");
  if (["COMPLETED", "IMPORTING", "CANCELLED"].includes(imp.status)) throw new BusinessRuleError(`This import is ${imp.status.toLowerCase()} and can no longer be changed.`);
  return { imp, profile };
}

async function storeValidation(importId: string, profile: ImportProfile<unknown>, options: unknown, rows: ParsedRow[], extra: { reconciliation?: unknown; notes?: unknown } = {}) {
  await profile.resolve(rows, prisma, options);
  const stored = rows.filter(worthStoring);
  const counts = countRows(stored.filter((r) => r.data.role === "line"));
  await prisma.$transaction(
    async (tx) => {
      await tx.importRow.deleteMany({ where: { importId } });
      const data = stored.map((r) => rowData(importId, r));
      for (let i = 0; i < data.length; i += 500) await tx.importRow.createMany({ data: data.slice(i, i + 500) });
      await tx.import.update({
        where: { id: importId },
        data: { status: "VALIDATED", validatedAt: new Date(), options: options as Prisma.InputJsonValue, errorMessage: null, summary: { counts, ...extra } as unknown as Prisma.InputJsonValue },
      });
    },
    { timeout: 120_000 },
  );
  return counts;
}

/** Save the mapping (Map step) and validate every row of the file (Validate step). */
export async function mapAndValidate(actor: Actor, id: string, rawOptions: unknown) {
  const { imp, profile } = await editableImport(actor, id);
  const parsedOptions = profile.schema.safeParse(rawOptions);
  if (!parsedOptions.success) {
    throw new ValidationFailedError("The mapping is incomplete.", {}, parsedOptions.error.issues.map((i) => `${i.path.join(".") || "options"}: ${i.message}`));
  }
  const options = parsedOptions.data as Record<string, unknown>;
  if (profile.fields) {
    const columns = (options.columns ?? {}) as Record<string, string>;
    const fixed = ["year", "mdaCode"].filter((k) => options[k] !== null && options[k] !== undefined);
    const missing = profile.fields.filter((f) => f.required && !columns[f.key] && !fixed.includes(f.key)).map((f) => f.label);
    const needsYear = !columns.year && (options.year === null || options.year === undefined) && profile.fields.some((f) => f.key === "year");
    const needsMda = !columns.mdaCode && (options.mdaCode === null || options.mdaCode === undefined) && profile.fields.some((f) => f.key === "mdaCode");
    if (needsYear) missing.push("Budget year (map a column or choose a year)");
    if (needsMda) missing.push("MDA code (map a column or choose an MDA)");
    if (missing.length) throw new ValidationFailedError("Map the required columns before validating.", {}, missing.map((m) => `Not mapped: ${m}`));
  }
  const wb = await loadFile(imp);
  let out;
  try {
    out = profile.parse(wb, options);
  } catch (e) {
    throw new ValidationFailedError(`The file could not be processed with this mapping: ${(e as Error).message}`);
  }
  const counts = await storeValidation(id, profile, options, out.rows, { reconciliation: out.reconciliation ?? [], notes: out.notes ?? {} });
  await audit(prisma, actor, { action: "VALIDATE", entityType: "Import", entityId: id, summary: `Validated ${imp.fileName}: ${counts.valid} valid, ${counts.warnings} warnings, ${counts.errors} errors, ${counts.duplicates} duplicates` });
  return counts;
}

/** Re-validate stored rows (after corrections) without re-reading the file. */
async function revalidateStored(importId: string, profile: ImportProfile<unknown>, options: unknown) {
  const stored = await prisma.importRow.findMany({ where: { importId }, orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }] });
  const rows = stored.map((r) => ({ id: r.id, resolution: r.resolution, parsed: toParsed(r) }));
  const active = rows.filter((r) => r.resolution !== "SKIP").map((r) => r.parsed);
  profile.reinterpret?.(active, options);
  await profile.resolve(active, prisma, options);
  const imp = await prisma.import.findUniqueOrThrow({ where: { id: importId } });
  await prisma.$transaction(
    async (tx) => {
      for (const r of rows) {
        const p = r.parsed;
        await tx.importRow.update({ where: { id: r.id }, data: { status: r.resolution === "SKIP" ? "SKIPPED" : p.status, issues: p.issues as unknown as Prisma.InputJsonValue, data: JSON.parse(JSON.stringify(p.data)) as Prisma.InputJsonValue } });
      }
      const all = rows.map((r) => ({ status: (r.resolution === "SKIP" ? "SKIPPED" : r.parsed.status) as ParsedRow["status"], role: r.parsed.data.role }));
      const counts = countRows(all.filter((r) => r.role === "line"));
      await tx.import.update({ where: { id: importId }, data: { validatedAt: new Date(), summary: jsonSafe({ ...((imp.summary as object) ?? {}), counts }) } });
    },
    { timeout: 120_000 },
  );
}

/** Correct the values of one row (table profiles) and re-validate. */
export async function correctImportRow(actor: Actor, rowId: string, values: Record<string, string | number | null>) {
  const row = await prisma.importRow.findUnique({ where: { id: rowId } });
  if (!row) throw new NotFoundError("import row");
  const { imp, profile } = await editableImport(actor, row.importId);
  if (!profile.correctable || !profile.fields) throw new BusinessRuleError("Rows of this import type cannot be corrected here. Correct the workbook and upload it again, or skip the row.");
  const allowed = new Set(profile.fields.map((f) => f.key));
  const clean = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k)).map(([k, v]) => [k, typeof v === "string" ? v.trim().slice(0, 500) : v]));
  const data = row.data as Record<string, unknown>;
  const before = (data.values ?? {}) as Record<string, unknown>;
  await prisma.importRow.update({ where: { id: rowId }, data: { data: { ...data, values: { ...before, ...clean }, corrected: true } as Prisma.InputJsonValue, resolution: "CORRECTED" } });
  await revalidateStored(imp.id, profile, imp.options);
  await audit(prisma, actor, { action: "UPDATE", entityType: "ImportRow", entityId: rowId, summary: `Corrected ${row.sheetName} row ${row.rowNumber} of ${imp.fileName}`, oldValue: before, newValue: clean });
}

export async function setImportRowSkipped(actor: Actor, rowId: string, skip: boolean) {
  const row = await prisma.importRow.findUnique({ where: { id: rowId } });
  if (!row) throw new NotFoundError("import row");
  const { imp, profile } = await editableImport(actor, row.importId);
  await prisma.importRow.update({ where: { id: rowId }, data: { resolution: skip ? "SKIP" : null } });
  await revalidateStored(imp.id, profile, imp.options);
}

export async function cancelImport(actor: Actor, id: string) {
  const { imp } = await editableImport(actor, id);
  await prisma.$transaction(async (tx) => {
    await tx.import.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, { action: "IMPORT", entityType: "Import", entityId: id, summary: `Cancelled import of ${imp.fileName}` });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────────────────────────────────────

export async function commitImport(actor: Actor, id: string) {
  const { imp, profile } = await editableImport(actor, id);
  if (imp.status !== "VALIDATED") throw new BusinessRuleError("Validate the file before importing.");
  const stored = await prisma.importRow.findMany({ where: { importId: id }, orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }] });
  const rows = stored.map((r) => ({ id: r.id, resolution: r.resolution, parsed: toParsed(r) }));
  const active = rows.filter((r) => r.resolution !== "SKIP");
  const parsed = active.map((r) => r.parsed);
  // Reference data may have changed since validation: resolve again before writing.
  profile.reinterpret?.(parsed, imp.options);
  await profile.resolve(parsed, prisma, imp.options);
  const importable = parsed.filter((r) => r.data.role === "line" && (r.status === "VALID" || r.status === "WARNING"));
  if (importable.length === 0) throw new BusinessRuleError("There are no valid rows to import. Correct or skip the rows with errors first.");

  await prisma.import.update({ where: { id }, data: { status: "IMPORTING" } });
  try {
    const label = `${imp.fileName} (import ${id.slice(-6)})`;
    const result = await prisma.$transaction(async (tx) => profile.commit(tx, actor, parsed, imp.options, label), { timeout: 600_000, maxWait: 30_000 });
    const finalRows = rows.map((r) => ({ ...r, status: (r.resolution === "SKIP" ? "SKIPPED" : r.parsed.status) as ParsedRow["status"] }));
    const counts = countRows(finalRows.filter((r) => r.parsed.data.role === "line").map((r) => ({ status: r.status })));
    await prisma.$transaction(
      async (tx) => {
        for (const r of finalRows) {
          if (r.status !== toParsed(stored.find((s) => s.id === r.id)!).status) await tx.importRow.update({ where: { id: r.id }, data: { status: r.status } });
        }
        await tx.import.update({
          where: { id },
          data: { status: "COMPLETED", completedAt: new Date(), summary: { ...((imp.summary as object) ?? {}), counts, result } as unknown as Prisma.InputJsonValue },
        });
        await audit(tx, actor, { action: "IMPORT", entityType: "Import", entityId: id, summary: `Imported ${imp.fileName} (${profile.label.en}): ${counts.imported} row(s) imported, ${counts.errors} with errors, ${counts.duplicates} duplicates, ${counts.skipped} skipped` });
      },
      { timeout: 120_000 },
    );
    return { counts, result };
  } catch (e) {
    await prisma.import.update({ where: { id }, data: { status: "FAILED", errorMessage: (e as Error).message.slice(0, 2000) } });
    await audit(prisma, actor, { action: "IMPORT", entityType: "Import", entityId: id, summary: `Import of ${imp.fileName} failed; no data was written`, reason: (e as Error).message.slice(0, 500) });
    throw new BusinessRuleError(`The import failed and no data was written: ${(e as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function listImports(actor: Actor, filters: { page: number; pageSize: number; profile?: string; status?: string }) {
  const where: Prisma.ImportWhereInput = {
    ...(can(actor, "admin.settings.manage") || can(actor, "audit.view") ? {} : { createdById: actor.id }),
    ...(filters.profile ? { profile: filters.profile } : {}),
    ...(filters.status ? { status: filters.status as Prisma.ImportWhereInput["status"] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.import.count({ where }),
    prisma.import.findMany({ where, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, include: { createdBy: { select: { fullName: true } } } }),
  ]);
  return { total, rows };
}

export async function getImport(actor: Actor, id: string) {
  const imp = await prisma.import.findUnique({ where: { id }, include: { createdBy: { select: { fullName: true } } } });
  if (!imp) throw new NotFoundError("import");
  if (imp.createdById !== actor.id && !can(actor, "admin.settings.manage") && !can(actor, "audit.view")) throw new NotFoundError("import");
  return imp;
}

export async function listImportRows(importId: string, filters: { status?: string; sheet?: string; q?: string; page: number; pageSize: number }) {
  const where: Prisma.ImportRowWhereInput = {
    importId,
    ...(filters.status ? { status: filters.status as ImportRowStatus } : {}),
    ...(filters.sheet ? { sheetName: filters.sheet } : {}),
    ...(filters.q ? { OR: [{ data: { path: ["code"], string_contains: filters.q } }, { data: { path: ["mdaCode"], string_contains: filters.q } }] } : {}),
  };
  const [total, rows, byStatus, sheets] = await Promise.all([
    prisma.importRow.count({ where }),
    prisma.importRow.findMany({ where, orderBy: [{ sheetName: "asc" }, { rowNumber: "asc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.importRow.groupBy({ by: ["status"], where: { importId }, _count: { _all: true } }),
    prisma.importRow.groupBy({ by: ["sheetName"], where: { importId }, _count: { _all: true } }),
  ]);
  return { total, rows, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), sheets: sheets.map((s) => ({ name: s.sheetName, count: s._count._all })) };
}

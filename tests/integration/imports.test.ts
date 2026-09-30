import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError } from "@/lib/errors";
import { commitImport, correctImportRow, getImport, mapAndValidate, setImportRowSkipped, uploadImport } from "@/lib/services/imports";
import { actorFor, csvFile, mdaId, yearId } from "../support/db";

let admin: Actor;

beforeAll(async () => {
  admin = await actorFor("admin");
});

async function rowsOf(importId: string) {
  return prisma.importRow.findMany({ where: { importId }, orderBy: { rowNumber: "asc" } });
}

describe("expenditure actuals import", () => {
  let importId: string;

  it("detects the table and suggests the column mapping", async () => {
    const file = csvFile("actuals-jul-2026.csv", [
      ["Year", "Month", "MDA code", "Economic code", "Actual", "Remarks"],
      [2026, "Jul", "10101", "2111", "1,000.50", "Salaries"],
      [2026, 7, "10101", "2113", 250, null],
      [2026, 7, "10101", "2111", 999, "Repeated line"],
      [2026, 13, "10101", "2111", 1, null],
      [2026, 7, "10101", "999999", 5, null],
      [2026, 7, "10101", "111101", 5, null],
      [2026, 7, "10101", "2224", "(1,000)", null],
      [2025, 7, "10101", "2111", 1, null],
      [2026, 7, "10101", "211104", 40, "No allocation at this code"],
    ]);
    const imp = await uploadImport(admin, { profile: "execution-expenditure", file });
    importId = imp.id;
    expect(imp.status).toBe("UPLOADED");
    const options = imp.options as { columns: Record<string, string>; year: number | null };
    expect(options.columns).toMatchObject({ year: "A", month: "B", mdaCode: "C", code: "D", amount: "E", remarks: "F" });
    expect(options.year).toBeNull();
  });

  it("validates every row and explains each problem", async () => {
    const imp = await getImport(admin, importId);
    const counts = await mapAndValidate(admin, importId, imp.options);
    expect(counts).toMatchObject({ total: 9, valid: 2, warnings: 1, errors: 5, duplicates: 1 });
    const rows = await rowsOf(importId);
    const byRow = new Map(rows.map((r) => [r.rowNumber, r]));
    const messages = (n: number) => (byRow.get(n)!.issues as { message: string }[]).map((i) => i.message).join(" | ");
    expect(byRow.get(2)!.status).toBe("VALID");
    expect(messages(2)).toMatch(/Replaces the .* already recorded/);
    expect(byRow.get(4)!.status).toBe("DUPLICATE");
    expect(messages(5)).toMatch(/"13" is not a month/);
    expect(messages(6)).toMatch(/Unknown expenditure code 999999/);
    expect(messages(7)).toMatch(/revenue code/);
    expect(messages(8)).toMatch(/negative amounts are not allowed/);
    expect(messages(9)).toMatch(/2025 is closed/);
    expect(byRow.get(10)!.status).toBe("WARNING");
    expect(messages(10)).toMatch(/no approved allocation/);
  });

  it("re-validates after a correction and a skipped row", async () => {
    const rows = await rowsOf(importId);
    await correctImportRow(admin, rows.find((r) => r.rowNumber === 5)!.id, { month: "6" });
    await setImportRowSkipped(admin, rows.find((r) => r.rowNumber === 6)!.id, true);
    const after = new Map((await rowsOf(importId)).map((r) => [r.rowNumber, r]));
    expect(after.get(5)!.status).toBe("VALID");
    expect(after.get(5)!.resolution).toBe("CORRECTED");
    expect(after.get(6)!.status).toBe("SKIPPED");
    const summary = (await getImport(admin, importId)).summary as { counts: { valid: number; errors: number; skipped: number } };
    expect(summary.counts).toMatchObject({ valid: 3, errors: 3, skipped: 1 });
  });

  it("imports only valid and warning rows, in one transaction", async () => {
    const { counts } = await commitImport(admin, importId);
    expect(counts.imported).toBe(4);
    const imp = await getImport(admin, importId);
    expect(imp.status).toBe("COMPLETED");
    const y = await yearId(2026);
    const m = await mdaId("10101");
    const code = await prisma.budgetCode.findFirstOrThrow({ where: { kind: "EXPENDITURE", code: "2111" } });
    const july = await prisma.expenditureExecution.findUniqueOrThrow({ where: { budgetYearId_mdaId_budgetCodeId_month: { budgetYearId: y, mdaId: m, budgetCodeId: code.id, month: 7 } } });
    expect(Number(july.actualAmount)).toBe(1000.5);
    expect(july.source).toBe("IMPORT");
    const june = await prisma.expenditureExecution.findUniqueOrThrow({ where: { budgetYearId_mdaId_budgetCodeId_month: { budgetYearId: y, mdaId: m, budgetCodeId: code.id, month: 6 } } });
    expect(Number(june.actualAmount)).toBe(1);
    await expect(commitImport(admin, importId)).rejects.toThrow(/completed/);
    const log = await prisma.auditLog.findFirst({ where: { entityType: "Import", entityId: importId, action: "IMPORT" }, orderBy: { id: "desc" } });
    expect(log?.summary).toMatch(/4 row\(s\) imported/);
  });
});

describe("budget lines import", () => {
  it("creates a draft budget for the preparation year and rejects unsafe targets", async () => {
    const rows = [
      ["Year", "MDA", "Code", "Description", "Amount"],
      [2027, "10201", "211101", "Salaries", 5000],
      [2027, "10201", "211103", "Health staff", 3000],
      [2027, "10201", "211101", "Salaries again", 7000],
      [2027, "99999", "211101", "Unknown agency", 10],
      [2027, "10201", "111101", "Revenue", 100],
    ];
    const imp = await uploadImport(admin, { profile: "budget-lines", file: csvFile("lines-2027.csv", rows) });
    const options = imp.options as Record<string, unknown>;

    // Approved budgets for a year still in preparation would bypass the workflow.
    const approvedCounts = await mapAndValidate(admin, imp.id, { ...options, target: "APPROVED" });
    expect(approvedCounts.valid).toBe(0);
    const firstIssue = ((await rowsOf(imp.id))[0].issues as { message: string }[])[0].message;
    expect(firstIssue).toMatch(/must go through review and approval/);

    const counts = await mapAndValidate(admin, imp.id, { ...options, target: "DRAFT" });
    expect(counts).toMatchObject({ total: 5, valid: 3, errors: 1, duplicates: 1 });
    await commitImport(admin, imp.id);

    const submission = await prisma.budgetSubmission.findFirstOrThrow({ where: { budgetYear: { year: 2027 }, mda: { code: "10201" } }, include: { lines: { include: { budgetCode: true } } } });
    expect(submission.status).toBe("DRAFT");
    expect(submission.source).toBe("IMPORT");
    expect(Number(submission.totalExpenditure)).toBe(8000);
    expect(Number(submission.totalRevenue)).toBe(100);
    expect(submission.lines.find((l) => l.budgetCode.code === "211101")?.description).toBe("Salaries");
  });
});

describe("chart of accounts import", () => {
  it("creates new codes under their parent and updates names", async () => {
    const imp = await uploadImport(admin, {
      profile: "chart-of-accounts",
      file: csvFile("codes.csv", [
        ["Code", "Name", "English name", "Category"],
        ["211108", "Mushaarka tijaabada", "Test salaries", null],
        ["211101", "Mushaharka Shaqaalaha", null, null],
        ["211103", "Mushaarka shaqaalaha caafimaadka (cusub)", null, null],
        ["ABC", "Not a code", null, null],
        ["211109", "Bad category", null, "NOPE"],
      ]),
    });
    const counts = await mapAndValidate(admin, imp.id, imp.options);
    expect(counts).toMatchObject({ total: 5, valid: 2, duplicates: 1, errors: 2 });
    await commitImport(admin, imp.id);
    const created = await prisma.budgetCode.findFirstOrThrow({ where: { kind: "EXPENDITURE", code: "211108" }, include: { parent: true, category: true } });
    expect(created.parent?.code).toBe("2111");
    expect(created.path.endsWith("/2111/211108")).toBe(true);
    expect(created.category?.code).toBe("PERSONNEL");
    expect(created.nameEn).toBe("Test salaries");
    const renamed = await prisma.budgetCode.findFirstOrThrow({ where: { kind: "EXPENDITURE", code: "211103" } });
    expect(renamed.name).toBe("Mushaarka shaqaalaha caafimaadka (cusub)");
  });

  it("requires the permission of the import type", async () => {
    const officer = await actorFor("officer.10101");
    await expect(uploadImport(officer, { profile: "chart-of-accounts", file: csvFile("codes.csv", [["Code", "Name"], ["1", "x"]]) })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects files whose content does not match the extension", async () => {
    const fake = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "budget.xlsx");
    await expect(uploadImport(admin, { profile: "budget-lines", file: fake })).rejects.toThrow(/does not match/);
  });
});

describe("budget workbook import", () => {
  it("recognises the consolidated workbook and reports approved budgets as duplicates", async () => {
    const buffer = readFileSync(path.resolve("data/reference/Final Draft Budget 2027.xlsx"));
    const imp = await uploadImport(admin, { profile: "budget-workbook", file: new File([buffer], "Final Draft Budget 2027.xlsx") });
    const detected = imp.detected as { confidence: number; sheets: { role: string }[] };
    expect(detected.confidence).toBeGreaterThan(0.5);
    expect(detected.sheets.map((s) => s.role)).toEqual(expect.arrayContaining(["REVENUE_DETAIL", "SUMMARY", "MDA_SUMMARY", "MDA_DETAIL"]));
    const options = imp.options as { years: { year: number; target: string }[] };
    const counts = await mapAndValidate(admin, imp.id, { ...options, years: options.years.map((y) => ({ ...y, target: y.year === 2026 ? "APPROVED" : "SKIP" })) });
    expect(counts.errors).toBe(0);
    expect(counts.duplicates).toBeGreaterThan(20);
    expect(counts.valid).toBe(0);
    await expect(commitImport(admin, imp.id)).rejects.toThrow(/no valid rows/);
  });
});

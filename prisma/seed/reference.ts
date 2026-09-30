/**
 * Reference data extracted from the supplied workbook "Final Draft Budget 2027.xlsx":
 * the chart of accounts (revenue + expenditure codes), MDAs and the crosswalk from
 * the 2026 summary codes to the detailed chart. Safe to run repeatedly.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { BudgetWorkbookOptions } from "../../src/lib/imports/profiles/budget-workbook";
import { parseBudgetWorkbook } from "../../src/lib/imports/profiles/budget-workbook";
import { extractReference, findParentCode, levelOfCode } from "../../src/lib/imports/reference-builder";
import { BUDGET_CATEGORIES, categoryForCode, LEGACY_CROSSWALK, LEGACY_SUMMARY_SCHEME } from "../../src/lib/imports/reference-data";
import type { WorkbookData } from "../../src/lib/imports/workbook";

const AGENCY_TYPE_BY_CODE: Record<string, string> = {
  "10101": "PRESIDENCY",
  "10201": "LEGISLATURE",
  "20301": "JUDICIARY",
  "10601": "OFFICE",
  "10701": "OFFICE",
  "10801": "OFFICE",
  "20401": "FORCE",
  "20501": "FORCE",
  "20601": "FORCE",
  "20701": "FORCE",
};
const REVENUE_COLLECTING = new Set(["10301", "30201", "40101", "30902", "30903", "20201", "30401"]);

export async function seedReference(prisma: PrismaClient, wb: WorkbookData, options: BudgetWorkbookOptions) {
  const parsed = parseBudgetWorkbook(wb, options);
  const reference = extractReference(parsed.rows, options.sheets);
  const categories = new Map((await prisma.budgetCategory.findMany()).map((c) => [c.code, c.id]));

  // ── Codes (parents first so paths and parent links can be set) ────────────
  for (const kind of ["REVENUE", "EXPENDITURE"] as const) {
    const codes = reference.codes.filter((c) => c.kind === kind).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
    const all = new Set(codes.map((c) => c.code));
    const ids = new Map<string, { id: string; path: string }>();
    for (const [i, c] of codes.entries()) {
      const parentCode = findParentCode(c.code, all);
      const parent = parentCode ? ids.get(parentCode) : undefined;
      const hasChildren = codes.some((x) => x.code !== c.code && x.code.startsWith(c.code));
      const categoryCode = categoryForCode(c.code);
      const data = {
        name: c.name,
        nameEn: c.nameEn,
        parentId: parent?.id ?? null,
        level: levelOfCode(c.code),
        path: parent ? `${parent.path}/${c.code}` : c.code,
        categoryId: categoryCode ? categories.get(categoryCode) ?? null : null,
        isPostable: !hasChildren,
        sortOrder: i,
      };
      const row = await prisma.budgetCode.upsert({
        where: { kind_code_effectiveFromYear: { kind, code: c.code, effectiveFromYear: 2020 } },
        create: { code: c.code, kind, effectiveFromYear: 2020, ...data },
        update: data,
      });
      ids.set(c.code, { id: row.id, path: row.path });
    }
  }

  // Default code for each reporting category (used for category-level entries such as the Foom 4 template).
  for (const c of BUDGET_CATEGORIES) {
    const code = await prisma.budgetCode.findFirst({ where: { code: c.defaultCode, kind: c.kind } });
    if (code) await prisma.budgetCategory.update({ where: { code: c.code }, data: { defaultCodeId: code.id } });
  }

  // ── Crosswalk for the 2026 summary codes ─────────────────────────────────
  for (const m of LEGACY_CROSSWALK) {
    const target = await prisma.budgetCode.findFirst({ where: { code: m.target, kind: "EXPENDITURE" } });
    if (!target) throw new Error(`Crosswalk target ${m.target} missing from the chart of accounts`);
    await prisma.codeMapping.upsert({
      where: { scheme_sourceCode: { scheme: LEGACY_SUMMARY_SCHEME, sourceCode: m.sourceCode } },
      create: { scheme: LEGACY_SUMMARY_SCHEME, sourceCode: m.sourceCode, sourceName: m.sourceName, targetCodeId: target.id, notes: m.notes ?? null },
      update: { sourceName: m.sourceName, targetCodeId: target.id, notes: m.notes ?? null },
    });
  }

  // ── MDAs ─────────────────────────────────────────────────────────────────
  const sectors = new Map((await prisma.sector.findMany()).map((s) => [s.code, s.id]));
  const lookups = await prisma.lookupValue.findMany();
  const lookup = (category: string, code: string) => lookups.find((l) => l.category === category && l.code === code)?.id ?? null;
  for (const m of reference.mdas) {
    const sectorId = sectors.get(m.sectorCode);
    if (!sectorId) throw new Error(`Unknown sector ${m.sectorCode} for MDA ${m.code}`);
    const data = {
      name: m.name,
      nameEn: m.nameEn,
      sectorId,
      agencyTypeId: lookup("AGENCY_TYPE", AGENCY_TYPE_BY_CODE[m.code] ?? "MINISTRY"),
      regionId: lookup("REGION", "HQ"),
      categoryId: lookup("MDA_CATEGORY", REVENUE_COLLECTING.has(m.code) ? "REVENUE" : "SPENDING"),
    };
    await prisma.mda.upsert({ where: { code: m.code }, create: { code: m.code, ...data }, update: {} });
  }

  return { codes: reference.codes.length, mdas: reference.mdas.length, parsed };
}

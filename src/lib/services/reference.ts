/**
 * Cached reference data (budget categories, validation rules, lookups).
 * Reference data changes rarely; transaction data is always read fresh.
 */
import type { LookupCategory } from "@/generated/prisma/client";
import type { CategoryDef, RuleConfig, RuleCode } from "@/lib/calculations";
import { prisma } from "@/lib/db";

let categoryCache: { value: CategoryDef[]; at: number } | null = null;
let ruleCache: { value: RuleConfig[]; at: number } | null = null;
const TTL = 30_000;

export async function getCategories(): Promise<CategoryDef[]> {
  if (categoryCache && Date.now() - categoryCache.at < TTL) return categoryCache.value;
  const rows = await prisma.budgetCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const value: CategoryDef[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    nameSo: c.nameSo,
    kind: c.kind,
    summaryGroup: c.summaryGroup,
    isCapital: c.isCapital,
    procurementEligible: c.procurementEligible,
    sortOrder: c.sortOrder,
  }));
  categoryCache = { value, at: Date.now() };
  return value;
}

export async function getValidationRules(): Promise<RuleConfig[]> {
  if (ruleCache && Date.now() - ruleCache.at < TTL) return ruleCache.value;
  const rows = await prisma.validationRule.findMany({ orderBy: { sortOrder: "asc" } });
  const value: RuleConfig[] = rows.map((r) => ({
    code: r.code as RuleCode,
    severity: r.severity,
    isActive: r.isActive,
    tolerance: Number(r.tolerance),
    params: (r.params as Record<string, unknown> | null) ?? null,
  }));
  ruleCache = { value, at: Date.now() };
  return value;
}

export function invalidateReferenceCache() {
  categoryCache = null;
  ruleCache = null;
}

export async function getLookups(category: LookupCategory, includeInactive = false) {
  return prisma.lookupValue.findMany({
    where: { category, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Codes applicable to a budget year (effective range) of the given kind. */
export async function getCodesForYear(kind: "REVENUE" | "EXPENDITURE", year: number, opts: { postableOnly?: boolean; categoryId?: string } = {}) {
  return prisma.budgetCode.findMany({
    where: {
      kind,
      isActive: true,
      effectiveFromYear: { lte: year },
      OR: [{ effectiveToYear: null }, { effectiveToYear: { gte: year } }],
      ...(opts.postableOnly ? { isPostable: true } : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    },
    orderBy: [{ path: "asc" }],
    select: { id: true, code: true, name: true, nameEn: true, level: true, path: true, categoryId: true, isPostable: true, parentId: true },
  });
}

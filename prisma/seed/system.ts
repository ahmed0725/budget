/**
 * System configuration (not development data): permissions, roles, settings,
 * lookups, budget categories, validation rules, sectors and budget years.
 * Safe to run repeatedly (upserts).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEFAULT_ROLES, PERMISSIONS } from "../../src/lib/auth/permissions";
import { RULE_CATALOGUE, RULE_CODES } from "../../src/lib/calculations/validation";
import { BUDGET_CATEGORIES, SECTORS } from "../../src/lib/imports/reference-data";
import { DEFAULT_SETTINGS } from "../../src/lib/services/settings";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

export async function seedSystem(prisma: PrismaClient) {
  // Permissions
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, name: meta.name, group: meta.group }, update: { name: meta.name, group: meta.group } });
  }
  const permissions = await prisma.permission.findMany();
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  // Roles (permissions only set on first creation so administrator changes survive re-seeding)
  for (const role of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: role.key } });
    if (existing) {
      await prisma.role.update({ where: { id: existing.id }, data: { name: role.name, nameSo: role.nameSo, description: role.description, isSystem: true } });
      continue;
    }
    await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        nameSo: role.nameSo,
        description: role.description,
        isSystem: true,
        permissions: { create: role.permissions.map((p) => ({ permissionId: permId.get(p)! })) },
      },
    });
  }

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  // Lookups
  const lookups: { category: "AGENCY_TYPE" | "REGION" | "MDA_CATEGORY" | "FUNDING_SOURCE" | "PROCUREMENT_METHOD"; code: string; name: string; nameEn: string }[] = [
    { category: "AGENCY_TYPE", code: "PRESIDENCY", name: "Madaxtooyo", nameEn: "Presidency" },
    { category: "AGENCY_TYPE", code: "LEGISLATURE", name: "Gole Sharci-dejin", nameEn: "Legislature" },
    { category: "AGENCY_TYPE", code: "JUDICIARY", name: "Garsoor", nameEn: "Judiciary" },
    { category: "AGENCY_TYPE", code: "MINISTRY", name: "Wasaarad", nameEn: "Ministry" },
    { category: "AGENCY_TYPE", code: "OFFICE", name: "Xafiis", nameEn: "Independent office" },
    { category: "AGENCY_TYPE", code: "FORCE", name: "Ciidan / Hay'ad amni", nameEn: "Security force / agency" },
    { category: "AGENCY_TYPE", code: "AGENCY", name: "Hay'ad", nameEn: "Agency" },
    { category: "REGION", code: "HQ", name: "Xarunta Dowladda (Laascaanood)", nameEn: "State headquarters (Las Anod)" },
    { category: "REGION", code: "SOOL", name: "Sool", nameEn: "Sool" },
    { category: "REGION", code: "SANAAG", name: "Sanaag", nameEn: "Sanaag" },
    { category: "REGION", code: "CAYN", name: "Cayn", nameEn: "Cayn" },
    { category: "MDA_CATEGORY", code: "REVENUE", name: "Hay'ad dakhli ururisa", nameEn: "Revenue-collecting agency" },
    { category: "MDA_CATEGORY", code: "SPENDING", name: "Hay'ad kharash", nameEn: "Spending agency" },
    { category: "FUNDING_SOURCE", code: "GOV", name: "Dakhliga Dowladda", nameEn: "Government revenue" },
    { category: "FUNDING_SOURCE", code: "FGS", name: "Deeqda Dowladda Federaalka", nameEn: "Federal Government transfer" },
    { category: "FUNDING_SOURCE", code: "WB", name: "Bangiga Adduunka", nameEn: "World Bank" },
    { category: "FUNDING_SOURCE", code: "EU", name: "Midowga Yurub", nameEn: "European Union" },
    { category: "FUNDING_SOURCE", code: "UN", name: "Hay'adaha QM", nameEn: "United Nations agencies" },
    { category: "FUNDING_SOURCE", code: "OTHER", name: "Deeq-bixiye kale", nameEn: "Other development partner" },
    { category: "PROCUREMENT_METHOD", code: "ONB", name: "Tartan Furan (Gudaha)", nameEn: "Open national bidding" },
    { category: "PROCUREMENT_METHOD", code: "OIB", name: "Tartan Furan (Caalami)", nameEn: "Open international bidding" },
    { category: "PROCUREMENT_METHOD", code: "RB", name: "Tartan Xaddidan", nameEn: "Restricted bidding" },
    { category: "PROCUREMENT_METHOD", code: "RFQ", name: "Codsi Qiimeyn", nameEn: "Request for quotations" },
    { category: "PROCUREMENT_METHOD", code: "DIRECT", name: "Iibsi Toos ah", nameEn: "Direct procurement" },
    { category: "PROCUREMENT_METHOD", code: "FRAMEWORK", name: "Heshiis Qaab-dhismeed", nameEn: "Framework agreement" },
  ];
  for (const [i, l] of lookups.entries()) {
    await prisma.lookupValue.upsert({
      where: { category_code: { category: l.category, code: l.code } },
      create: { ...l, sortOrder: i },
      update: { name: l.name, nameEn: l.nameEn },
    });
  }

  // Budget categories
  for (const c of BUDGET_CATEGORIES) {
    const { defaultCode: _d, ...data } = c;
    await prisma.budgetCategory.upsert({ where: { code: c.code }, create: { ...data, summaryGroup: data.summaryGroup ?? null }, update: { name: c.name, nameSo: c.nameSo } });
  }

  // Validation rules
  for (const [i, code] of RULE_CODES.entries()) {
    const meta = RULE_CATALOGUE[code];
    await prisma.validationRule.upsert({
      where: { code },
      create: {
        code,
        name: meta.name.en,
        nameSo: meta.name.so,
        description: meta.description,
        severity: meta.defaultSeverity,
        form: meta.form,
        field: meta.field,
        params: (meta.defaultParams as object) ?? undefined,
        sortOrder: i,
      },
      update: { name: meta.name.en, nameSo: meta.name.so, description: meta.description, form: meta.form, field: meta.field, sortOrder: i },
    });
  }

  // Sectors
  for (const [i, s] of SECTORS.entries()) {
    await prisma.sector.upsert({ where: { code: s.code }, create: { ...s, sortOrder: i }, update: { name: s.name, nameEn: s.nameEn } });
  }

  // Budget years (fiscal year = calendar year)
  const years = [
    { year: 2024, status: "CLOSED" as const, prep: "2023-08-01", deadline: "2023-10-15" },
    { year: 2025, status: "CLOSED" as const, prep: "2024-08-01", deadline: "2024-10-15" },
    { year: 2026, status: "ACTIVE" as const, prep: "2025-08-01", deadline: "2025-10-15" },
    { year: 2027, status: "PREPARATION" as const, prep: "2026-08-01", deadline: "2026-10-05" },
    { year: 2028, status: "DRAFT" as const, prep: "2027-08-01", deadline: "2027-10-15" },
  ];
  for (const y of years) {
    const prev = y.year - 1;
    const data = {
      name: `FY ${y.year}`,
      startDate: d(`${y.year}-01-01`),
      endDate: d(`${y.year}-12-31`),
      preparationStart: d(y.prep),
      preparationEnd: d(y.deadline),
      submissionDeadline: d(y.deadline),
      reviewStart: d(`${prev}-10-16`),
      reviewEnd: d(`${prev}-11-15`),
      approvalStart: d(`${prev}-11-16`),
      approvalEnd: d(`${prev}-12-15`),
      executionStart: d(`${y.year}-01-01`),
      executionEnd: d(`${y.year}-12-31`),
      closingDate: d(`${y.year + 1}-03-31`),
      status: y.status,
    };
    await prisma.budgetYear.upsert({ where: { year: y.year }, create: { year: y.year, ...data }, update: {} });
  }
}

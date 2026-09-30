import { z } from "zod";

const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
const optionalId = z.preprocess((v) => (v === "" || v === "__none__" ? null : v), z.string().min(1).nullable().optional());
const isoDate = z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional());

export const mdaSchema = z.object({
  code: z.string().trim().regex(/^\d{3,10}$/, "The MDA code must contain 3–10 digits"),
  name: z.string().trim().min(2, "Name is required").max(200),
  nameEn: optionalText(200),
  shortName: optionalText(60),
  sectorId: z.string().min(1, "Select a sector"),
  parentId: optionalId,
  agencyTypeId: optionalId,
  regionId: optionalId,
  categoryId: optionalId,
  accountingOfficer: optionalText(150),
  financeDirector: optionalText(150),
  budgetOfficer: optionalText(150),
  contactPerson: optionalText(150),
  phone: optionalText(50),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid e-mail address").max(200).nullable().optional()),
  address: optionalText(300),
});
export type MdaInput = z.infer<typeof mdaSchema>;

export const codeSchema = z.object({
  kind: z.enum(["REVENUE", "EXPENDITURE"]),
  code: z.string().trim().regex(/^\d{1,10}$/, "Codes contain digits only"),
  name: z.string().trim().min(2, "Name is required").max(250),
  nameEn: optionalText(250),
  description: optionalText(1000),
  parentId: optionalId,
  categoryId: optionalId,
  isPostable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  effectiveFromYear: z.coerce.number().int().min(1990).max(2100),
  effectiveToYear: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(1990).max(2100).nullable()),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});
export type CodeInput = z.infer<typeof codeSchema>;

export const yearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  name: z.string().trim().min(2).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preparationStart: isoDate,
  preparationEnd: isoDate,
  submissionDeadline: isoDate,
  reviewStart: isoDate,
  reviewEnd: isoDate,
  approvalStart: isoDate,
  approvalEnd: isoDate,
  executionStart: isoDate,
  executionEnd: isoDate,
  closingDate: isoDate,
  notes: optionalText(2000),
});
export type YearInput = z.infer<typeof yearSchema>;

export const userSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required").max(150),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, "3–50 characters: letters, digits, dot, dash or underscore"),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(200),
  jobTitle: optionalText(150),
  phone: optionalText(50),
  locale: z.enum(["en", "so"]).default("en"),
  isActive: z.boolean().default(true),
  roleIds: z.array(z.string()).min(1, "Assign at least one role"),
  assignments: z.array(z.object({ mdaId: z.string().min(1), type: z.enum(["BUDGET_OFFICER", "FINANCE_OFFICER", "ACCOUNTING_OFFICER", "REVIEWER", "VIEWER"]) })).max(200).default([]),
});
export type UserInput = z.infer<typeof userSchema>;

export const roleSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,40}$/, "Use capitals, digits and underscores (e.g. REGIONAL_REVIEWER)"),
  name: z.string().trim().min(2).max(100),
  nameSo: optionalText(100),
  description: optionalText(500),
  permissions: z.array(z.string()).max(200),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const lookupSchema = z.object({
  category: z.enum(["AGENCY_TYPE", "REGION", "MDA_CATEGORY", "FUNDING_SOURCE", "PROCUREMENT_METHOD"]),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,40}$/, "Use capitals, digits, dash or underscore"),
  name: z.string().trim().min(1).max(150),
  nameEn: optionalText(150),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

export const ruleSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["ERROR", "WARNING", "INFO"]),
  isActive: z.boolean(),
  tolerance: z.coerce.number().min(0).max(1_000_000),
  thresholdPercent: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).max(1000).nullable()).optional(),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  nameSo: z.string().trim().min(1).max(150),
  procurementEligible: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

/**
 * Input schemas for budget preparation (shared by client forms and server actions).
 * The server always re-validates; client validation is only for fast feedback.
 */
import { z } from "zod";

const MAX_AMOUNT = 1e13;

/** Amount: accepts numbers or formatted strings ("1,250.00"); blank → 0. */
export const amount = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? 0 : Number(v.replace(/[,$\s]/g, ""))) : v ?? 0),
  z.number({ error: "Enter a valid amount" }).finite("Enter a valid amount").min(0, "Amount cannot be negative").max(MAX_AMOUNT, "Amount is too large"),
);

/** Optional amount: blank → null. */
export const optionalAmount = z.preprocess(
  (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v),
  z.number({ error: "Enter a valid amount" }).finite().min(0, "Amount cannot be negative").max(MAX_AMOUNT).nullable(),
);

export const count = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? 0 : Number(v)) : v ?? 0),
  z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(0, "Cannot be negative").max(1_000_000),
);

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const quarterSchema = z.enum(["Q1", "Q2", "Q3", "Q4"]);

/** Optimistic-concurrency token: the submission's updatedAt (ISO) when the form was loaded. */
export const revisionToken = z.string().min(1);

export const formASchema = z.object({
  allocationNumber: text(50).min(1, "Allocation number is required"),
  agencyCategory: text(150).min(1, "Category is required"),
  accountingOfficer: text(150).min(1, "Accounting officer is required"),
  contactPerson: text(150).min(1, "Contact person is required"),
  telephone: text(50).min(5, "Enter a valid telephone number"),
  email: z.string().trim().email("Enter a valid e-mail address").max(200),
});
export type FormAInput = z.infer<typeof formASchema>;

export const expenditureLineSchema = z.object({
  id: z.string().optional().nullable(),
  budgetCodeId: z.string().min(1, "Select a classification code"),
  description: optionalText(300),
  amount,
  justification: optionalText(2000),
});

export const formDSchema = z.object({
  lines: z.array(expenditureLineSchema).max(2000),
  /** Justification per Form D category (key = category id). */
  categoryNotes: z.record(z.string(), z.string().max(4000)).default({}),
});
export type FormDInput = z.infer<typeof formDSchema>;

export const revenueLineSchema = z.object({
  id: z.string().optional().nullable(),
  budgetCodeId: z.string().min(1, "Select a revenue code"),
  description: optionalText(300),
  amount,
  priorYearActual: optionalAmount,
  currentYearEstimate: optionalAmount,
  justification: optionalText(2000),
});

export const formCSchema = z.object({
  lines: z.array(revenueLineSchema).max(2000),
  categoryNotes: z.record(z.string(), z.string().max(4000)).default({}),
  noRevenue: z.boolean().default(false),
});
export type FormCInput = z.infer<typeof formCSchema>;

export const formBSchema = z.object({
  notes: z.record(z.enum(["PERSONNEL", "GOODS_SERVICES", "CAPITAL", "OTHER", "TOTAL"]), z.string().max(4000)),
});
export type FormBInput = z.infer<typeof formBSchema>;

export const personnelRowSchema = z.object({
  id: z.string().optional().nullable(),
  positionTitle: text(200).min(1, "Position title is required"),
  grade: optionalText(50),
  department: optionalText(150),
  budgetCodeId: z.string().optional().nullable(),
  approvedEstablishment: count,
  filledPositions: count,
  monthlyCost: amount,
  remarks: optionalText(1000),
});

export const formESchema = z.object({
  rows: z.array(personnelRowSchema).max(1000),
});
export type FormEInput = z.infer<typeof formESchema>;

export const capitalRowSchema = z.object({
  lineId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  projectCode: optionalText(50),
  name: text(250).min(1, "Project name is required"),
  location: optionalText(200),
  description: optionalText(2000),
  justification: optionalText(4000),
  budgetCodeId: z.string().min(1, "Select a capital classification code"),
  totalCost: amount,
  spentToDate: amount,
  allocation: amount,
  fundingSourceId: z.string().optional().nullable(),
  fundingType: z.enum(["GOVERNMENT", "DONOR", "MIXED"]),
  projectType: z.enum(["NEW", "ONGOING"]),
  isMultiYear: z.boolean().default(false),
  startYear: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(1990).max(2100).nullable()),
  expectedCompletionDate: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional()),
  status: z.enum(["PROPOSED", "UNDER_REVIEW", "APPROVED", "ACTIVE", "COMPLETED", "SUSPENDED", "CANCELLED"]),
});

export const formFSchema = z.object({
  rows: z.array(capitalRowSchema).max(500),
  noCapital: z.boolean().default(false),
});
export type FormFInput = z.infer<typeof formFSchema>;

export const procurementRowSchema = z.object({
  id: z.string().optional().nullable(),
  itemDescription: text(300).min(1, "Item description is required"),
  estimatedCost: amount,
  procurementMethodId: z.string().optional().nullable(),
  quarter: quarterSchema,
  responsibleDepartment: optionalText(150),
  budgetCategoryId: z.string().optional().nullable(),
  capitalProjectId: z.string().optional().nullable(),
  remarks: optionalText(1000),
});

export const formGSchema = z.object({
  rows: z.array(procurementRowSchema).max(2000),
  noProcurement: z.boolean().default(false),
});
export type FormGInput = z.infer<typeof formGSchema>;

export const formHSchema = z.object({
  rows: z
    .array(z.object({ quarter: quarterSchema, amount, remarks: optionalText(1000) }))
    .length(4, "All four quarters are required"),
});
export type FormHInput = z.infer<typeof formHSchema>;

export const createSubmissionSchema = z.object({
  budgetYearId: z.string().min(1),
  mdaId: z.string().min(1),
  prefill: z.enum(["EMPTY", "PRIOR_YEAR"]).default("PRIOR_YEAR"),
});

export const createRevisionSchema = z.object({
  submissionId: z.string().min(1),
  revisionType: z.enum(["SUPPLEMENTARY", "REALLOCATION", "BUDGET_CUT", "BUDGET_INCREASE", "AGENCY_ADJUSTMENT"]),
  reason: text(2000).min(10, "Explain the reason for the revision (at least 10 characters)"),
});

export const lineUpdateSchema = z.object({
  lineId: z.string().min(1),
  amount: amount.optional(),
  description: optionalText(300),
  justification: optionalText(2000),
});

export const bulkLineUpdateSchema = z.object({
  lineIds: z.array(z.string()).min(1).max(5000),
  mode: z.enum(["SET", "PERCENT", "ADD"]),
  value: z.number().finite().min(-100).max(MAX_AMOUNT),
  reason: optionalText(500),
});

export const workflowActionSchema = z.object({
  submissionId: z.string().min(1),
  action: z.enum(["SUBMIT", "RESUBMIT", "WITHDRAW", "START_REVIEW", "RECOMMEND", "ENDORSE", "APPROVE", "REJECT", "RETURN", "PUBLISH", "REOPEN"]),
  comment: optionalText(4000),
  corrections: z
    .array(
      z.object({
        form: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "VALIDATION", "CERTIFICATION", "GENERAL"]),
        section: optionalText(150),
        field: optionalText(150),
        comment: text(2000).min(1, "Describe the problem"),
        requiredCorrection: text(2000).min(1, "Describe the correction required"),
      }),
    )
    .max(100)
    .default([]),
});
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;

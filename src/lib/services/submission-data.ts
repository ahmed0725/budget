/**
 * Assembles everything about one budget submission: form rows, prior-year
 * baselines (from the approved budget of the previous year), server-computed form
 * summaries and live validation results.
 */
import type { Prisma } from "@/generated/prisma/client";
import {
  computeFormCompletion,
  computeSubmissionSummary,
  overallCompletion,
  tallyResults,
  toAmount,
  validateBudgetConsistency,
  type CapitalData,
  type CategoryDef,
  type CheckResult,
  type LineData,
  type QuarterKey,
  type SubmissionData,
  type SubmissionSummary,
  type ValidationTally,
} from "@/lib/calculations";
import { parallel, prisma, type Tx } from "@/lib/db";
import { getCategories, getValidationRules } from "./reference";
import { getSettings } from "./settings";

type Client = Tx | typeof prisma;

export interface ExpenditureLineRow {
  id: string;
  budgetCodeId: string;
  code: string;
  codeName: string;
  codeNameEn: string | null;
  categoryId: string | null;
  description: string | null;
  amount: number;
  /** Prior-year approved amount for the same code (system data). */
  baseline: number;
  justification: string | null;
  source: string;
}

export interface RevenueLineRow extends ExpenditureLineRow {
  priorYearActual: number | null;
  currentYearEstimate: number | null;
}

export interface CapitalRow {
  lineId: string;
  projectId: string | null;
  budgetCodeId: string;
  code: string;
  codeName: string;
  name: string;
  projectCode: string | null;
  location: string | null;
  description: string | null;
  justification: string | null;
  totalCost: number;
  spentToDate: number;
  allocation: number;
  priorApproved: number;
  fundingSourceId: string | null;
  fundingSourceName: string | null;
  fundingType: string;
  projectType: string;
  isMultiYear: boolean;
  startYear: number | null;
  expectedCompletionDate: string | null;
  status: string;
}

export interface PersonnelRowData {
  id: string;
  positionTitle: string;
  grade: string | null;
  department: string | null;
  budgetCodeId: string | null;
  approvedEstablishment: number;
  filledPositions: number;
  monthlyCost: number;
  annualCost: number;
  remarks: string | null;
}

export interface ProcurementRowData {
  id: string;
  itemDescription: string;
  estimatedCost: number;
  procurementMethodId: string | null;
  procurementMethodName: string | null;
  quarter: QuarterKey;
  responsibleDepartment: string | null;
  budgetCategoryId: string | null;
  capitalProjectId: string | null;
  remarks: string | null;
}

export interface CashFlowRowData {
  quarter: QuarterKey;
  amount: number;
  remarks: string | null;
}

export const submissionInclude = {
  mda: { include: { sector: true } },
  budgetYear: true,
  certification: true,
  assignedReviewer: { select: { id: true, fullName: true, email: true } },
  submittedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  parentSubmission: { select: { id: true, revisionNumber: true, status: true } },
} satisfies Prisma.BudgetSubmissionInclude;

export type SubmissionRecord = Prisma.BudgetSubmissionGetPayload<{ include: typeof submissionInclude }>;

export interface SubmissionBundle {
  submission: SubmissionRecord;
  categories: CategoryDef[];
  priorYear: number;
  baselineSubmissionId: string | null;
  /** Prior-year (or original approved, for revisions) amounts by budget code id. */
  baselineByCode: Record<string, number>;
  expenditureLines: ExpenditureLineRow[];
  revenueLines: RevenueLineRow[];
  capital: CapitalRow[];
  personnel: PersonnelRowData[];
  procurement: ProcurementRowData[];
  cashFlow: CashFlowRowData[];
  notes: Record<string, string>;
  data: SubmissionData;
  summary: SubmissionSummary;
  completion: Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", number>;
  overallCompletion: number;
  checks: CheckResult[];
  tally: ValidationTally;
}

/** The approved submission currently in force for an MDA and year (latest approved revision). */
export async function findEffectiveApproved(client: Client, mdaId: string, year: number) {
  return client.budgetSubmission.findFirst({
    where: { mdaId, budgetYear: { year }, status: { in: ["APPROVED", "PUBLISHED"] }, supersededAt: null },
    orderBy: { revisionNumber: "desc" },
    select: { id: true, revisionNumber: true },
  });
}

function categoryFallback(categories: CategoryDef[]) {
  return categories.find((c) => c.code === "OTHER_RECURRENT")?.id ?? null;
}

/** Load and compute a full submission bundle. Throws when the submission does not exist. */
export async function loadSubmissionBundle(client: Client, submissionId: string, opts: { locale?: "en" | "so" } = {}): Promise<SubmissionBundle> {
  const submission = await client.budgetSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: submissionInclude });
  const [categories, rules, settings] = await Promise.all([getCategories(), getValidationRules(), getSettings()]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const fallbackCategory = categoryFallback(categories);
  const priorYear = submission.budgetYear.year - 1;

  // For revisions the baseline is the approved budget being revised; otherwise the prior year.
  const baselineSubmission =
    submission.type === "REVISION" && submission.parentSubmissionId
      ? { id: submission.parentSubmissionId }
      : await findEffectiveApproved(client, submission.mdaId, priorYear);

  const [lines, baselineLines, personnel, procurement, cashFlow, notes] = await parallel(
    client,
    () =>
      client.budgetLine.findMany({
        where: { submissionId },
        include: { budgetCode: true, capitalProject: { include: { fundingSource: true } } },
        orderBy: [{ sortOrder: "asc" }, { budgetCode: { path: "asc" } }],
      }),
    () =>
      baselineSubmission
        ? client.budgetLine.findMany({
            where: { submissionId: baselineSubmission.id },
            select: { budgetCodeId: true, kind: true, amount: true, capitalProjectId: true, budgetCode: { select: { categoryId: true } } },
          })
        : Promise.resolve([]),
    () =>
      client.personnelBudget.findMany({ where: { submissionId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    () =>
      client.procurementPlan.findMany({ where: { submissionId }, include: { procurementMethod: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    () =>
      client.cashFlowForecast.findMany({ where: { submissionId } }),
    () =>
      client.submissionNote.findMany({ where: { submissionId } }),
  );

  // ── Baselines ────────────────────────────────────────────────────────────
  const baselineByCode = new Map<string, number>();
  const baselineByProject = new Map<string, number>();
  const baselineExpByCategory: Record<string, number> = {};
  const baselineRevByCategory: Record<string, number> = {};
  let baselineCapital = 0;
  for (const bl of baselineLines) {
    const amount = toAmount(bl.amount);
    const catId = bl.budgetCode.categoryId ?? fallbackCategory;
    const cat = catId ? categoryById.get(catId) : undefined;
    if (bl.capitalProjectId) {
      baselineByProject.set(bl.capitalProjectId, toAmount((baselineByProject.get(bl.capitalProjectId) ?? 0) + amount));
    } else {
      baselineByCode.set(bl.budgetCodeId, toAmount((baselineByCode.get(bl.budgetCodeId) ?? 0) + amount));
    }
    if (bl.kind === "REVENUE") {
      if (catId) baselineRevByCategory[catId] = toAmount((baselineRevByCategory[catId] ?? 0) + amount);
    } else if (cat?.isCapital) {
      baselineCapital = toAmount(baselineCapital + amount);
    } else if (catId) {
      baselineExpByCategory[catId] = toAmount((baselineExpByCategory[catId] ?? 0) + amount);
    }
  }

  // ── Rows ─────────────────────────────────────────────────────────────────
  const expenditureLines: ExpenditureLineRow[] = [];
  const revenueLines: RevenueLineRow[] = [];
  const capital: CapitalRow[] = [];
  for (const line of lines) {
    const catId = line.budgetCode.categoryId ?? (line.kind === "EXPENDITURE" ? fallbackCategory : null);
    const cat = catId ? categoryById.get(catId) : undefined;
    const base = {
      id: line.id,
      budgetCodeId: line.budgetCodeId,
      code: line.budgetCode.code,
      codeName: line.budgetCode.name,
      codeNameEn: line.budgetCode.nameEn,
      categoryId: catId,
      description: line.description,
      amount: toAmount(line.amount),
      baseline: baselineByCode.get(line.budgetCodeId) ?? 0,
      justification: line.justification,
      source: line.source,
    };
    if (line.kind === "REVENUE") {
      revenueLines.push({
        ...base,
        priorYearActual: line.priorYearActual === null ? null : toAmount(line.priorYearActual),
        currentYearEstimate: line.currentYearEstimate === null ? null : toAmount(line.currentYearEstimate),
      });
    } else if (cat?.isCapital || line.capitalProjectId) {
      const p = line.capitalProject;
      capital.push({
        lineId: line.id,
        projectId: p?.id ?? null,
        budgetCodeId: line.budgetCodeId,
        code: line.budgetCode.code,
        codeName: line.budgetCode.name,
        name: p?.name ?? line.description ?? line.budgetCode.name,
        projectCode: p?.projectCode ?? null,
        location: p?.location ?? null,
        description: p?.description ?? null,
        justification: p?.justification ?? line.justification,
        totalCost: p ? toAmount(p.totalCost) : toAmount(line.amount),
        spentToDate: p ? toAmount(p.spentToDate) : 0,
        allocation: toAmount(line.amount),
        priorApproved: p ? baselineByProject.get(p.id) ?? 0 : baselineByCode.get(line.budgetCodeId) ?? 0,
        fundingSourceId: p?.fundingSourceId ?? null,
        fundingSourceName: p?.fundingSource?.name ?? null,
        fundingType: p?.fundingType ?? "GOVERNMENT",
        projectType: p?.projectType ?? "ONGOING",
        isMultiYear: p?.isMultiYear ?? false,
        startYear: p?.startYear ?? null,
        expectedCompletionDate: p?.expectedCompletionDate ? p.expectedCompletionDate.toISOString().slice(0, 10) : null,
        status: p?.status ?? "APPROVED",
      });
    } else {
      expenditureLines.push(base);
    }
  }

  const personnelRows: PersonnelRowData[] = personnel.map((p) => ({
    id: p.id,
    positionTitle: p.positionTitle,
    grade: p.grade,
    department: p.department,
    budgetCodeId: p.budgetCodeId,
    approvedEstablishment: p.approvedEstablishment,
    filledPositions: p.filledPositions,
    monthlyCost: toAmount(p.monthlyCost),
    annualCost: toAmount(p.annualCost),
    remarks: p.remarks,
  }));

  const procurementRows: ProcurementRowData[] = procurement.map((p) => ({
    id: p.id,
    itemDescription: p.itemDescription,
    estimatedCost: toAmount(p.estimatedCost),
    procurementMethodId: p.procurementMethodId,
    procurementMethodName: p.procurementMethod?.name ?? null,
    quarter: p.quarter,
    responsibleDepartment: p.responsibleDepartment,
    budgetCategoryId: p.budgetCategoryId,
    capitalProjectId: p.capitalProjectId,
    remarks: p.remarks,
  }));

  const cashFlowRows: CashFlowRowData[] = (["Q1", "Q2", "Q3", "Q4"] as QuarterKey[]).map((q) => {
    const row = cashFlow.find((c) => c.quarter === q);
    return { quarter: q, amount: row ? toAmount(row.amount) : 0, remarks: row?.remarks ?? null };
  });

  const notesMap: Record<string, string> = {};
  for (const n of notes) notesMap[`${n.form}:${n.key}`] = n.text;

  const toLineData = (l: ExpenditureLineRow | RevenueLineRow): LineData => ({
    id: l.id,
    budgetCodeId: l.budgetCodeId,
    categoryId: l.categoryId,
    amount: l.amount,
    priorYearActual: "priorYearActual" in l ? l.priorYearActual : undefined,
    currentYearEstimate: "currentYearEstimate" in l ? l.currentYearEstimate : undefined,
    justification: l.justification,
  });

  const capitalData: CapitalData[] = capital.map((c) => ({
    id: c.lineId,
    projectId: c.projectId ?? `line:${c.lineId}`,
    name: c.name,
    totalCost: c.totalCost,
    spentToDate: c.spentToDate,
    allocation: c.allocation,
    priorApproved: c.priorApproved,
    // Capital lines without a project (imported historical data) are not held to project-detail rules.
    fundingSourceId: c.projectId ? c.fundingSourceId : "n/a",
    expectedCompletionDate: c.projectId ? c.expectedCompletionDate : "n/a",
    justification: c.projectId ? c.justification : "n/a",
    location: c.location,
  }));

  const data: SubmissionData = {
    categories,
    formA: {
      agencyName: `${submission.mda.code} — ${submission.mda.name}`,
      allocationNumber: submission.allocationNumber,
      agencyCategory: submission.agencyCategory,
      accountingOfficer: submission.accountingOfficer,
      contactPerson: submission.contactPerson,
      telephone: submission.telephone,
      email: submission.email,
    },
    expenditureLines: expenditureLines.map(toLineData),
    revenueLines: revenueLines.map(toLineData),
    capital: capitalData,
    personnel: personnelRows.map((p) => ({
      id: p.id,
      positionTitle: p.positionTitle,
      grade: p.grade,
      approvedEstablishment: p.approvedEstablishment,
      filledPositions: p.filledPositions,
      monthlyCost: p.monthlyCost,
      annualCost: p.annualCost,
    })),
    procurement: procurementRows.map((p) => ({
      id: p.id,
      itemDescription: p.itemDescription,
      estimatedCost: p.estimatedCost,
      quarter: p.quarter,
      procurementMethodId: p.procurementMethodId,
      budgetCategoryId: p.budgetCategoryId,
      capitalProjectId: p.capitalProjectId,
    })),
    cashFlow: cashFlowRows.map((c) => ({ quarter: c.quarter, amount: c.amount })),
    baseline: {
      expenditureByCategory: baselineExpByCategory,
      revenueByCategory: baselineRevByCategory,
      capitalApproved: baselineCapital,
    },
    notes: notesMap,
  };

  const summary = computeSubmissionSummary(data);
  const completion = computeFormCompletion(data, summary);
  const checks = validateBudgetConsistency(data, summary, rules, {
    locale: opts.locale ?? "en",
    certificationPrepared: Boolean(submission.certification?.preparedAt),
    currencySymbol: settings.currency.symbol,
  });

  return {
    submission,
    categories,
    priorYear,
    baselineSubmissionId: baselineSubmission?.id ?? null,
    baselineByCode: Object.fromEntries(baselineByCode),
    expenditureLines,
    revenueLines,
    capital,
    personnel: personnelRows,
    procurement: procurementRows,
    cashFlow: cashFlowRows,
    notes: notesMap,
    data,
    summary,
    completion,
    overallCompletion: overallCompletion(completion),
    checks,
    tally: tallyResults(checks),
  };
}

/**
 * Recompute and store the server-side summaries of a submission (totals, completion,
 * validation counts). Must be called after every change to form data.
 */
export async function refreshSubmissionTotals(client: Client, submissionId: string): Promise<SubmissionBundle> {
  const bundle = await loadSubmissionBundle(client, submissionId);
  if (!bundle.submission.isLocked) {
    await client.budgetSubmission.update({
      where: { id: submissionId },
      data: {
        totalRevenue: bundle.summary.totals.revenue,
        totalExpenditure: bundle.summary.totals.expenditure,
        totalRecurrent: bundle.summary.totals.recurrent,
        totalPersonnel: bundle.summary.totals.personnel,
        totalCapital: bundle.summary.totals.capital,
        completion: bundle.overallCompletion,
        validationErrors: bundle.tally.errors,
        validationWarnings: bundle.tally.warnings,
        validationPassed: bundle.tally.passed,
      },
    });
  }
  return bundle;
}

/** Persist the latest validation results (Validation Center, dashboards, reports). */
export async function storeValidationResults(client: Client, submissionId: string, checks: CheckResult[]): Promise<string> {
  const runId = `run_${Date.now().toString(36)}`;
  await client.validationCheck.deleteMany({ where: { submissionId } });
  if (checks.length > 0) {
    await client.validationCheck.createMany({
      data: checks.map((c) => ({
        submissionId,
        runId,
        ruleCode: c.ruleCode,
        name: c.name,
        status: c.status,
        severity: c.severity,
        calculated: c.calculated,
        expected: c.expected,
        difference: c.difference,
        message: c.details.length ? `${c.message}: ${c.details.slice(0, 10).join("; ")}` : c.message,
        action: c.action,
        form: c.form,
        field: c.field,
        sortOrder: c.sortOrder,
      })),
    });
  }
  const tally = tallyResults(checks);
  await client.budgetSubmission.update({
    where: { id: submissionId },
    data: { lastValidatedAt: new Date(), validationErrors: tally.errors, validationWarnings: tally.warnings, validationPassed: tally.passed },
  }).catch(() => undefined); // locked submissions keep their historical counts
  return runId;
}

/** Serializable snapshot of a submission, stored in budget_versions. */
export function buildSnapshot(bundle: SubmissionBundle) {
  const s = bundle.submission;
  return {
    schema: 1,
    submission: {
      id: s.id,
      status: s.status,
      type: s.type,
      revisionNumber: s.revisionNumber,
      budgetYear: s.budgetYear.year,
      mda: { id: s.mda.id, code: s.mda.code, name: s.mda.name },
      formA: {
        allocationNumber: s.allocationNumber,
        agencyCategory: s.agencyCategory,
        accountingOfficer: s.accountingOfficer,
        contactPerson: s.contactPerson,
        telephone: s.telephone,
        email: s.email,
      },
    },
    expenditureLines: bundle.expenditureLines.map((l) => ({ budgetCodeId: l.budgetCodeId, code: l.code, description: l.description, amount: l.amount, justification: l.justification })),
    revenueLines: bundle.revenueLines.map((l) => ({
      budgetCodeId: l.budgetCodeId,
      code: l.code,
      description: l.description,
      amount: l.amount,
      priorYearActual: l.priorYearActual,
      currentYearEstimate: l.currentYearEstimate,
      justification: l.justification,
    })),
    capital: bundle.capital,
    personnel: bundle.personnel,
    procurement: bundle.procurement,
    cashFlow: bundle.cashFlow,
    notes: bundle.notes,
    certification: s.certification,
  };
}

export type SubmissionSnapshot = ReturnType<typeof buildSnapshot>;

export function snapshotTotals(bundle: SubmissionBundle) {
  return {
    ...bundle.summary.totals,
    formB: bundle.summary.formB.total,
    formH: bundle.summary.formH.total,
    validation: { passed: bundle.tally.passed, warnings: bundle.tally.warnings, errors: bundle.tally.errors },
  };
}

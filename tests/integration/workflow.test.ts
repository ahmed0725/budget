import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { ValidationFailedError } from "@/lib/errors";
import { buildForm4Workbook } from "@/lib/exports/form4";
import { buildSubmissionPdf } from "@/lib/exports/submission-pdf";
import { sendDeadlineReminders } from "@/lib/services/notifications";
import { loadSubmissionBundle } from "@/lib/services/submission-data";
import { createRevision, saveFormA } from "@/lib/services/submissions";
import { getSettings } from "@/lib/services/settings";
import { performWorkflowAction, resolveCorrection, verifyCorrection } from "@/lib/services/workflow";
import { actorFor } from "../support/db";

async function submissionOf(mdaCode: string, year: number) {
  return prisma.budgetSubmission.findFirstOrThrow({ where: { mda: { code: mdaCode }, budgetYear: { year }, type: "ORIGINAL" } });
}

let reviewer: Actor;
let director: Actor;
let approver: Actor;

beforeAll(async () => {
  [reviewer, director, approver] = await Promise.all([actorFor("reviewer"), actorFor("director"), actorFor("approver")]);
});

describe("submission", () => {
  it("is blocked while validation errors remain, and the message lists them", async () => {
    const officer = await actorFor("officer.10101");
    const s = await submissionOf("10101", 2027);
    expect(s.status).toBe("DRAFT");
    const err = await performWorkflowAction(officer, { submissionId: s.id, action: "SUBMIT", comment: null, corrections: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailedError);
    expect(err.message).toMatch(/validation error/);
    expect(err.details.length).toBeGreaterThan(0);
    expect((await submissionOf("10101", 2027)).status).toBe("DRAFT");
  });

  it("locks the forms once submitted", async () => {
    const officer = await actorFor("officer.40101");
    const s = await submissionOf("40101", 2027);
    expect(s.status).toBe("SUBMITTED");
    await expect(saveFormA(officer, s.id, { allocationNumber: "40101", agencyCategory: "Social", accountingOfficer: "X", contactPerson: "Y", telephone: "0907000000", email: "x@example.org" })).rejects.toThrow();
  });
});

describe("review stages", () => {
  it("moves a budget through review, endorsement and approval, then locks it", async () => {
    const s = await submissionOf("40101", 2027);
    // Approval is not possible before the review stages.
    await expect(performWorkflowAction(approver, { submissionId: s.id, action: "APPROVE", comment: null, corrections: [] })).rejects.toThrow();
    await performWorkflowAction(reviewer, { submissionId: s.id, action: "START_REVIEW", comment: null, corrections: [] });
    await performWorkflowAction(reviewer, { submissionId: s.id, action: "RECOMMEND", comment: "Consistent with ceilings", corrections: [] });
    await performWorkflowAction(director, { submissionId: s.id, action: "ENDORSE", comment: null, corrections: [] });
    await performWorkflowAction(approver, { submissionId: s.id, action: "APPROVE", comment: "Approved", corrections: [] });
    const approved = await prisma.budgetSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { approvalSteps: true, versions: true } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.isLocked).toBe(true);
    expect(approved.approvalSteps.map((a) => a.action)).toEqual(expect.arrayContaining(["SUBMIT", "START_REVIEW", "RECOMMEND", "ENDORSE", "APPROVE"]));
    expect(approved.versions.some((v) => v.status === "APPROVED")).toBe(true);
    const officerNotified = await prisma.notification.count({ where: { user: { username: "officer.40101" }, type: "BUDGET_APPROVED", entityId: s.id } });
    expect(officerNotified).toBeGreaterThan(0);
  });

  it("rejects changes to approved budgets and to the audit trail at the database level", async () => {
    const s = await submissionOf("40101", 2027);
    const line = await prisma.budgetLine.findFirstOrThrow({ where: { submissionId: s.id } });
    await expect(prisma.budgetLine.update({ where: { id: line.id }, data: { amount: 1 } })).rejects.toThrow();
    const log = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { summary: "tampered" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow();
  });

  it("publishes an approved budget and creates execution allocations", async () => {
    const admin = await actorFor("admin");
    const s = await submissionOf("30501", 2027);
    expect(s.status).toBe("APPROVED");
    await performWorkflowAction(admin, { submissionId: s.id, action: "PUBLISH", comment: null, corrections: [] });
    const published = await prisma.budgetSubmission.findUniqueOrThrow({ where: { id: s.id } });
    expect(published.status).toBe("PUBLISHED");
    const allocations = await prisma.budgetAllocation.aggregate({ where: { sourceSubmissionId: s.id, kind: "EXPENDITURE" }, _sum: { originalAmount: true } });
    expect(Number(allocations._sum.originalAmount)).toBeCloseTo(Number(published.totalExpenditure), 2);
  });
});

describe("corrections", () => {
  it("returns with a correction list; the agency resolves and resubmits; the reviewer verifies", async () => {
    const s = await submissionOf("20501", 2027);
    expect(s.status).toBe("RETURNED");
    const officer = await actorFor("officer.20501");
    const corrections = await prisma.correctionItem.findMany({ where: { submissionId: s.id } });
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) await resolveCorrection(officer, c.id, "Corrected as requested");
    await performWorkflowAction(officer, { submissionId: s.id, action: "RESUBMIT", comment: "All corrections made", corrections: [] });
    expect((await submissionOf("20501", 2027)).status).toBe("SUBMITTED");
    for (const c of corrections) await verifyCorrection(reviewer, c.id, true, null);
    const after = await prisma.correctionItem.findMany({ where: { submissionId: s.id } });
    expect(after.every((c) => c.status === "ACCEPTED")).toBe(true);
  });

  it("requires a comment and a correction list to return a budget", async () => {
    const s = await submissionOf("40201", 2027);
    await expect(performWorkflowAction(reviewer, { submissionId: s.id, action: "RETURN", comment: null, corrections: [] })).rejects.toThrow();
  });
});

describe("revisions", () => {
  it("allows only one open revision per approved budget", async () => {
    const officer = await actorFor("officer.40101");
    const original = await submissionOf("40101", 2026);
    await expect(createRevision(officer, { submissionId: original.id, revisionType: "BUDGET_INCREASE", reason: "Second revision" })).rejects.toThrow(/revision/i);
  });
});

describe("exports", () => {
  it("regenerates the official Form 4 workbook and the PDF package from the database", async () => {
    const s = await submissionOf("10301", 2027);
    const bundle = await loadSubmissionBundle(prisma, s.id);
    const settings = await getSettings();
    const buf = await buildForm4Workbook(bundle, settings, { generatedBy: "Test", generatedAt: new Date(), versionLabel: null, mdaNameEn: null });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual(expect.arrayContaining(["Faahfaahinta Kharashka", "Hubinta"]));
    const pdf = await buildSubmissionPdf(bundle, settings, { generatedBy: "Test", generatedAt: new Date(), steps: [] });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("deadline reminders", () => {
  it("notifies agencies that have not submitted, once per reminder stage", async () => {
    const settings = await getSettings();
    const year = await prisma.budgetYear.findUniqueOrThrow({ where: { year: 2027 } });
    const now = new Date(year.submissionDeadline!.getTime() - 2 * 86_400_000);
    const first = await sendDeadlineReminders({ reminderDays: settings.budget.deadlineReminderDays, force: true, now });
    expect(first).toBeGreaterThan(0);
    const count = () => prisma.notification.count({ where: { type: "DEADLINE_APPROACHING", entityId: year.id } });
    const before = await count();
    await sendDeadlineReminders({ reminderDays: settings.budget.deadlineReminderDays, force: true, now });
    expect(await count()).toBe(before);
    const toOfficer = await prisma.notification.findFirst({ where: { type: "DEADLINE_APPROACHING", user: { username: "officer.10101" } } });
    expect(toOfficer?.title).toMatch(/due in 2 day/);
    const notToSubmitted = await prisma.notification.count({ where: { type: "DEADLINE_APPROACHING", user: { username: "officer.40201" } } });
    expect(notToSubmitted).toBe(0);
  });
});

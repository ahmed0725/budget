"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import {
  bulkLineUpdateSchema,
  createRevisionSchema,
  createSubmissionSchema,
  formASchema,
  formBSchema,
  formCSchema,
  formDSchema,
  formESchema,
  formFSchema,
  formGSchema,
  formHSchema,
  lineUpdateSchema,
  workflowActionSchema,
} from "@/lib/validations/budget";
import { addComment } from "@/lib/services/comments";
import * as submissions from "@/lib/services/submissions";
import { assignReviewer, performWorkflowAction, resolveCorrection, verifyCorrection } from "@/lib/services/workflow";

const idSchema = z.string().min(1).max(64);

function touched(submissionId: string) {
  revalidatePath(`/budget/workspace/${submissionId}`, "layout");
}

export async function createSubmissionAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const data = parseInput(createSubmissionSchema, input);
    const s = await submissions.createSubmission(actor, data);
    revalidatePath("/budget/submissions");
    return { id: s.id };
  });
}

export async function createRevisionAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("budget.revision.create", "budget.prepare");
    const data = parseInput(createRevisionSchema, input);
    const s = await submissions.createRevision(actor, data);
    revalidatePath("/budget/submissions");
    return { id: s.id };
  });
}

type FormKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

/** Save one of Forms A–H. Returns the new concurrency token (submission updatedAt). */
export async function saveFormAction(form: FormKey, submissionId: string, input: unknown, revision: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const id = parseInput(idSchema, submissionId);
    let res: { updatedAt: string };
    switch (form) {
      case "A":
        res = await submissions.saveFormA(actor, id, parseInput(formASchema, input), revision);
        break;
      case "B":
        res = await submissions.saveFormB(actor, id, parseInput(formBSchema, input), revision);
        break;
      case "C":
        res = await submissions.saveFormC(actor, id, parseInput(formCSchema, input), revision);
        break;
      case "D":
        res = await submissions.saveFormD(actor, id, parseInput(formDSchema, input), revision);
        break;
      case "E":
        res = await submissions.saveFormE(actor, id, parseInput(formESchema, input), revision);
        break;
      case "F":
        res = await submissions.saveFormF(actor, id, parseInput(formFSchema, input), revision);
        break;
      case "G":
        res = await submissions.saveFormG(actor, id, parseInput(formGSchema, input), revision);
        break;
      case "H":
        res = await submissions.saveFormH(actor, id, parseInput(formHSchema, input), revision);
        break;
    }
    touched(id);
    return { updatedAt: res.updatedAt };
  });
}

export async function distributeCashFlowAction(submissionId: string, revision: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const res = await submissions.distributeCashFlowEvenly(actor, parseInput(idSchema, submissionId), revision);
    touched(submissionId);
    return { updatedAt: res.updatedAt };
  });
}

export async function runValidationAction(submissionId: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.view");
    const tally = await submissions.runValidation(actor, parseInput(idSchema, submissionId));
    touched(submissionId);
    return { passed: tally.passed, warnings: tally.warnings, errors: tally.errors };
  });
}

export async function saveVersionAction(submissionId: string, reason: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const v = await submissions.saveCheckpoint(actor, parseInput(idSchema, submissionId), z.string().max(500).parse(reason) || null);
    touched(submissionId);
    return { label: v.label };
  });
}

export async function restoreVersionAction(submissionId: string, versionId: string, reason: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.version.restore");
    await submissions.restoreVersion(actor, parseInput(idSchema, submissionId), parseInput(idSchema, versionId), z.string().max(500).parse(reason));
    touched(submissionId);
    return null;
  });
}

export async function certifyAction(submissionId: string, role: "PREPARED" | "REVIEWED" | "APPROVED" | "HR", title: string | null) {
  return runAction(async () => {
    const actor = await actorForAction();
    await submissions.signCertification(actor, parseInput(idSchema, submissionId), z.enum(["PREPARED", "REVIEWED", "APPROVED", "HR"]).parse(role), title?.slice(0, 150) || null);
    touched(submissionId);
    return null;
  });
}

export async function revokeCertificationAction(submissionId: string, role: "PREPARED" | "REVIEWED" | "APPROVED" | "HR") {
  return runAction(async () => {
    const actor = await actorForAction();
    await submissions.revokeCertification(actor, parseInput(idSchema, submissionId), z.enum(["PREPARED", "REVIEWED", "APPROVED", "HR"]).parse(role));
    touched(submissionId);
    return null;
  });
}

export async function workflowAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction();
    const data = parseInput(workflowActionSchema, input);
    const result = await performWorkflowAction(actor, data);
    touched(data.submissionId);
    revalidatePath("/submissions", "layout");
    revalidatePath("/dashboard");
    return result;
  });
}

export async function assignReviewerAction(submissionId: string, reviewerId: string) {
  return runAction(async () => {
    const actor = await actorForAction("review.assign");
    await assignReviewer(actor, parseInput(idSchema, submissionId), parseInput(idSchema, reviewerId));
    touched(submissionId);
    return null;
  });
}

export async function resolveCorrectionAction(submissionId: string, correctionId: string, note: string) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    await resolveCorrection(actor, parseInput(idSchema, correctionId), z.string().max(2000).parse(note));
    touched(submissionId);
    return null;
  });
}

export async function verifyCorrectionAction(submissionId: string, correctionId: string, accept: boolean, note: string | null) {
  return runAction(async () => {
    const actor = await actorForAction();
    await verifyCorrection(actor, parseInput(idSchema, correctionId), accept, note?.slice(0, 2000) ?? null);
    touched(submissionId);
    return null;
  });
}

export async function addCommentAction(submissionId: string, body: string, form: string | null) {
  return runAction(async () => {
    const actor = await actorForAction("comments.create");
    await addComment(actor, parseInput(idSchema, submissionId), z.string().max(4000).parse(body), form ? z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "GENERAL"]).parse(form) : null);
    touched(submissionId);
    return null;
  });
}

export async function updateLineAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const data = parseInput(lineUpdateSchema, input);
    await submissions.updateLine(actor, data);
    revalidatePath("/budget/items");
    return null;
  });
}

export async function bulkUpdateLinesAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("budget.prepare");
    const data = parseInput(bulkLineUpdateSchema, input);
    const res = await submissions.bulkUpdateLines(actor, data);
    revalidatePath("/budget/items");
    return res;
  });
}

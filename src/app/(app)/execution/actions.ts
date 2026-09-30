"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import * as execution from "@/lib/services/execution";

const id = z.string().min(1).max(64);
const year = z.coerce.number().int().min(1990).max(2100);
const kind = z.enum(["EXPENDITURE", "REVENUE"]);
const amount = z.coerce.number({ message: "Enter an amount" }).min(0, "Amounts cannot be negative").max(1e13);

export async function allocationOptionsAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("execution.view");
    const d = parseInput(z.object({ year, mdaId: id, kind }), input);
    return execution.allocationOptions(actor, d.year, d.mdaId, d.kind);
  });
}

export async function recordActualAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("execution.manage");
    const d = parseInput(
      z.object({
        year,
        kind,
        mdaId: id,
        codeId: z.string().min(1, "Select a code"),
        month: z.coerce.number().int().min(1, "Select a month").max(12),
        actual: amount,
        planned: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), amount.nullable()),
        remarks: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable()),
      }),
      input,
    );
    await execution.recordActual(actor, d);
    revalidatePath("/execution", "layout");
    return null;
  });
}

export async function createCommitmentAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("execution.manage");
    const d = parseInput(
      z.object({
        year,
        mdaId: id,
        codeId: z.string().min(1, "Select a code"),
        reference: z.string().trim().min(2, "Enter the reference (e.g. LPO number)").max(60),
        description: z.string().trim().min(3, "Describe what is being purchased").max(500),
        supplier: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullable()),
        amount: amount.refine((v) => v > 0, "The amount must be greater than zero"),
        commitmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date"),
      }),
      input,
    );
    const c = await execution.createCommitment(actor, d);
    revalidatePath("/execution", "layout");
    return { id: c.id };
  });
}

export async function commitmentStatusAction(commitmentId: string, action: string, reason: string | null) {
  return runAction(async () => {
    const actor = await actorForAction("execution.manage");
    await execution.changeCommitmentStatus(actor, parseInput(id, commitmentId), z.enum(["OBLIGATE", "PAY", "CANCEL"]).parse(action), reason?.trim() || null);
    revalidatePath("/execution", "layout");
    return null;
  });
}

export async function commitmentBalanceAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("execution.view");
    const d = parseInput(z.object({ year, mdaId: id, codeId: id }), input);
    return execution.commitmentBalance(actor, d.year, d.mdaId, d.codeId);
  });
}

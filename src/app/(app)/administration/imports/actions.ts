"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import { ValidationFailedError } from "@/lib/errors";
import { PROFILE_KEYS } from "@/lib/imports/profiles";
import * as imports from "@/lib/services/imports";

const id = z.string().min(1).max(64);
// Any of these permissions can run at least one import type; the service checks the exact one.
const IMPORT_PERMISSIONS = ["import.run", "execution.manage", "admin.codes.manage"] as const;

export async function uploadImportAction(formData: FormData) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    const profile = parseInput(z.enum(PROFILE_KEYS as [string, ...string[]], { message: "Choose what the file contains" }), formData.get("profile"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationFailedError("Choose a file to upload.", { file: ["Required"] });
    const imp = await imports.uploadImport(actor, { profile, file });
    revalidatePath("/administration/imports");
    return { id: imp.id };
  });
}

export async function mapAndValidateAction(importId: string, options: unknown) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    const counts = await imports.mapAndValidate(actor, parseInput(id, importId), options);
    revalidatePath(`/administration/imports/${importId}`);
    return counts;
  });
}

export async function correctImportRowAction(rowId: string, values: unknown) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    const data = parseInput(z.record(z.string(), z.union([z.string().max(500), z.number(), z.null()])), values);
    await imports.correctImportRow(actor, parseInput(id, rowId), data);
    revalidatePath("/administration/imports", "layout");
    return null;
  });
}

export async function skipImportRowAction(rowId: string, skip: boolean) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    await imports.setImportRowSkipped(actor, parseInput(id, rowId), z.boolean().parse(skip));
    revalidatePath("/administration/imports", "layout");
    return null;
  });
}

export async function commitImportAction(importId: string) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    const res = await imports.commitImport(actor, parseInput(id, importId));
    revalidatePath("/", "layout");
    return res.counts;
  });
}

export async function cancelImportAction(importId: string) {
  return runAction(async () => {
    const actor = await actorForAction(...IMPORT_PERMISSIONS);
    await imports.cancelImport(actor, parseInput(id, importId));
    revalidatePath("/administration/imports", "layout");
    return null;
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import { deleteAttachment, uploadAttachment } from "@/lib/services/attachments";

const schema = z.object({
  submissionId: z.string().min(1).max(64),
  category: z.enum(["BUDGET_JUSTIFICATION", "PROJECT_PROPOSAL", "PROCUREMENT_DOCUMENT", "STAFFING_JUSTIFICATION", "APPROVAL_LETTER", "OFFICIAL_STAMP", "SIGNED_CERTIFICATION", "OTHER"]),
  form: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "CERTIFICATION", "GENERAL"]).nullable(),
  section: z.string().max(150).nullable(),
  description: z.string().max(500).nullable(),
});

export async function uploadAttachmentAction(formData: FormData) {
  return runAction(async () => {
    const actor = await actorForAction("attachments.upload");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file received");
    const input = parseInput(schema, {
      submissionId: formData.get("submissionId"),
      category: formData.get("category"),
      form: formData.get("form") || null,
      section: (formData.get("section") as string) || null,
      description: (formData.get("description") as string) || null,
    });
    const att = await uploadAttachment(actor, { ...input, file });
    revalidatePath(`/budget/workspace/${input.submissionId}`, "layout");
    return { id: att.id };
  });
}

export async function deleteAttachmentAction(submissionId: string, id: string, reason: string) {
  return runAction(async () => {
    const actor = await actorForAction();
    await deleteAttachment(actor, z.string().min(1).parse(id), z.string().max(500).parse(reason));
    revalidatePath(`/budget/workspace/${submissionId}`, "layout");
    return null;
  });
}

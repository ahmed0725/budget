/**
 * Supporting documents for budget submissions. Files are stored outside the public
 * folder, verified by extension, size and file signature (magic bytes), hashed and
 * served only through an authorised route handler.
 */
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentCategory } from "@/generated/prisma/client";
import { can, canAccessMda, isAgencyMember, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import { audit } from "./audit";
import { getSettings } from "./settings";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Check the file content matches its extension (defends against renamed executables). */
export function signatureMatches(ext: string, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (ext) {
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    case "docx":
    case "xlsx":
      return starts(0x50, 0x4b, 0x03, 0x04);
    case "doc":
    case "xls":
      return starts(0xd0, 0xcf, 0x11, 0xe0);
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "csv":
      return !bytes.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

export function storageRoot() {
  // Runtime data directory: excluded from build-time file tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

export async function uploadAttachment(
  actor: Actor,
  input: { submissionId: string; file: File; category: AttachmentCategory; form: string | null; section: string | null; description: string | null },
) {
  if (!can(actor, "attachments.upload")) throw new AuthorizationError("You do not have permission to upload attachments.");
  const settings = await getSettings();
  const s = await prisma.budgetSubmission.findUnique({ where: { id: input.submissionId }, include: { mda: true, budgetYear: true } });
  if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
  if (s.isLocked && !(input.category === "APPROVAL_LETTER" && can(actor, "budget.publish"))) {
    throw new BusinessRuleError("This budget is approved and locked. Only an approval letter can be attached by the publishing authority.");
  }
  const name = path.basename(input.file.name).replace(/[^\w.\- ()]/g, "_").slice(0, 150);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!settings.attachments.allowedExtensions.includes(ext) || !MIME[ext]) {
    throw new ValidationFailedError(`Files of type .${ext || "?"} are not accepted. Allowed: ${settings.attachments.allowedExtensions.map((e) => `.${e}`).join(", ")}.`);
  }
  const maxBytes = settings.attachments.maxSizeMb * 1024 * 1024;
  if (input.file.size > maxBytes) throw new ValidationFailedError(`The file is larger than the ${settings.attachments.maxSizeMb} MB limit.`);
  if (input.file.size === 0) throw new ValidationFailedError("The file is empty.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (!signatureMatches(ext, bytes)) throw new ValidationFailedError(`The file content does not match a .${ext} file. Upload the original document.`);

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const id = crypto.randomUUID();
  const dir = path.join(storageRoot(), "attachments", String(new Date().getUTCFullYear()));
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${id}.${ext}`);
  await writeFile(storagePath, bytes, { flag: "wx" });

  return prisma.$transaction(async (tx) => {
    const att = await tx.attachment.create({
      data: {
        submissionId: s.id,
        entityType: "BudgetSubmission",
        entityId: s.id,
        form: (input.form as never) ?? null,
        section: input.section,
        category: input.category,
        description: input.description,
        fileName: name,
        mimeType: MIME[ext],
        size: input.file.size,
        sha256,
        storagePath: path.relative(storageRoot(), storagePath),
        uploadedById: actor.id,
      },
    });
    await audit(tx, actor, { action: "CREATE", entityType: "Attachment", entityId: att.id, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `Attached ${name} (${input.category})`, newValue: { fileName: name, size: input.file.size, sha256 } });
    return att;
  });
}

export async function readAttachment(actor: Actor, id: string) {
  const att = await prisma.attachment.findUnique({ where: { id }, include: { submission: true } });
  if (!att || att.deletedAt || !att.submission || !can(actor, "budget.view") || !canAccessMda(actor, att.submission.mdaId)) throw new NotFoundError("attachment");
  const full = path.resolve(storageRoot(), att.storagePath);
  if (!full.startsWith(storageRoot())) throw new NotFoundError("attachment");
  const data = await readFile(/*turbopackIgnore: true*/ full);
  return { att, data };
}

export async function deleteAttachment(actor: Actor, id: string, reason: string) {
  const att = await prisma.attachment.findUnique({ where: { id }, include: { submission: true } });
  if (!att || att.deletedAt || !att.submission || !canAccessMda(actor, att.submission.mdaId)) throw new NotFoundError("attachment");
  if (att.submission.isLocked) throw new BusinessRuleError("Attachments of an approved budget cannot be removed.");
  if (att.uploadedById !== actor.id && !(isAgencyMember(actor, att.submission.mdaId) && can(actor, "budget.prepare")) && !can(actor, "admin.settings.manage")) {
    throw new AuthorizationError("Only the uploader or the agency's budget staff can remove this attachment.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: "DELETE", entityType: "Attachment", entityId: id, mdaId: att.submission!.mdaId, budgetYearId: att.submission!.budgetYearId, summary: `Removed attachment ${att.fileName}`, reason });
  });
}

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { getWorkspace } from "../data";
import { AttachmentsView } from "./attachments-view";

export default async function AttachmentsPage({ params }: PageProps<"/budget/workspace/[id]/attachments">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const settings = await getSettings();
  const attachments = await prisma.attachment.findMany({
    where: { submissionId: id, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    include: { uploadedBy: { select: { fullName: true } } },
  });
  return (
    <AttachmentsView
      submissionId={id}
      canUpload={ws.permissions.canUpload && (!ws.header.isLocked || ws.actor.permissions.has("budget.publish"))}
      canRemove={ws.canEdit}
      locked={ws.header.isLocked}
      allowed={settings.attachments.allowedExtensions}
      maxSizeMb={settings.attachments.maxSizeMb}
      items={attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        category: a.category,
        form: a.form,
        section: a.section,
        description: a.description,
        size: a.size,
        uploadedBy: a.uploadedBy.fullName,
        uploadedAt: a.uploadedAt.toISOString(),
      }))}
    />
  );
}

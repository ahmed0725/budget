import { can } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { getWorkspace } from "../data";
import { CertificationView } from "./certification-view";

export default async function CertificationPage({ params }: PageProps<"/budget/workspace/[id]/certification">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const c = ws.bundle.submission.certification;
  const stamp = await prisma.attachment.findFirst({ where: { submissionId: id, category: "OFFICIAL_STAMP", deletedAt: null }, orderBy: { uploadedAt: "desc" }, select: { id: true, fileName: true } });
  const editable = ["DRAFT", "RETURNED"].includes(ws.header.status) && !ws.header.isLocked && ws.permissions.isAgency;
  const block = (role: "PREPARED" | "REVIEWED" | "APPROVED", name?: string | null, title?: string | null, at?: Date | null, signature?: string | null) => ({
    role,
    name: name ?? null,
    title: title ?? null,
    at: at?.toISOString() ?? null,
    signature: signature ?? null,
    canSign: editable && can(ws.actor, role === "PREPARED" ? "budget.certify.prepare" : role === "REVIEWED" ? "budget.certify.review" : "budget.certify.approve"),
  });
  return (
    <CertificationView
      submissionId={id}
      agency={`${ws.header.mda.code} — ${ws.header.mda.name}`}
      actorTitle={ws.actor.jobTitle}
      blocks={[
        block("PREPARED", c?.preparedByName, c?.preparedByTitle, c?.preparedAt, c?.preparedSignature),
        block("REVIEWED", c?.reviewedByName, c?.reviewedByTitle, c?.reviewedAt, c?.reviewedSignature),
        block("APPROVED", c?.approvedByName, c?.approvedByTitle, c?.approvedAt, c?.approvedSignature),
      ]}
      hr={{ name: c?.hrCertifiedByName ?? null, at: c?.hrCertifiedAt?.toISOString() ?? null, canSign: editable && can(ws.actor, "budget.certify.hr") }}
      stamp={stamp}
    />
  );
}

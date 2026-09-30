import { canAccessMda } from "@/lib/auth/actor";
import { listReviewData, reviewerCandidates } from "@/lib/services/comments";
import { getWorkspace } from "../data";
import { ReviewView } from "./review-view";

export default async function ReviewPage({ params }: PageProps<"/budget/workspace/[id]/review">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const data = await listReviewData(id);
  const reviewers = ws.permissions.canAssign && canAccessMda(ws.actor, ws.header.mda.id) ? await reviewerCandidates(ws.header.mda.id) : [];
  return (
    <ReviewView
      submissionId={id}
      status={ws.header.status}
      stage={ws.header.stage}
      assignedReviewer={ws.header.assignedReviewer}
      reviewers={reviewers}
      permissions={{
        canAssign: ws.permissions.canAssign,
        canComment: ws.permissions.canComment,
        canResolve: ws.permissions.isAgency && ws.header.status === "RETURNED" && ws.canEdit,
        canVerify: ws.permissions.isReviewer,
      }}
      steps={data.steps.map((s) => ({ id: s.id, stage: s.stage, action: s.action, fromStatus: s.fromStatus, toStatus: s.toStatus, actorName: s.actorName, comment: s.comment, createdAt: s.createdAt.toISOString(), versionLabel: s.version?.label ?? null }))}
      corrections={data.corrections.map((c) => ({
        id: c.id,
        form: c.form,
        section: c.section,
        comment: c.comment,
        requiredCorrection: c.requiredCorrection,
        status: c.status,
        resolutionNote: c.resolutionNote,
        createdAt: c.createdAt.toISOString(),
        returnedBy: data.userName(c.createdById) ?? c.review?.reviewer.fullName ?? null,
        reason: c.review?.summary ?? null,
        resolvedBy: data.userName(c.resolvedById),
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        verifiedBy: data.userName(c.verifiedById),
      }))}
      comments={data.comments.map((c) => ({ id: c.id, author: c.author.fullName, title: c.author.jobTitle, body: c.body, form: c.form, createdAt: c.createdAt.toISOString() }))}
    />
  );
}

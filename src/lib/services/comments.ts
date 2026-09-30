import { can, canAccessMda, isAgencyMember, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";
import { AuthorizationError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import { audit } from "./audit";
import { agencyUsers, notifyUsers } from "./notifications";

export async function addComment(actor: Actor, submissionId: string, body: string, form: string | null) {
  if (!can(actor, "comments.create")) throw new AuthorizationError("You do not have permission to add comments.");
  const text = body.trim();
  if (!text) throw new ValidationFailedError("Write a comment before posting.");
  return prisma.$transaction(async (tx) => {
    const s = await tx.budgetSubmission.findUnique({ where: { id: submissionId }, include: { mda: true, budgetYear: true } });
    if (!s || !canAccessMda(actor, s.mdaId)) throw new NotFoundError("budget submission");
    const comment = await tx.comment.create({
      data: { submissionId, authorId: actor.id, body: text.slice(0, 4000), form: (form as never) ?? null },
    });
    await audit(tx, actor, { action: "CREATE", entityType: "Comment", entityId: comment.id, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `Comment on ${s.mda.code} ${s.budgetYear.year} budget`, newValue: { form, body: text.slice(0, 500) } });
    const recipients = isAgencyMember(actor, s.mdaId) ? (s.assignedReviewerId ? [s.assignedReviewerId] : []) : await agencyUsers(tx, s.mdaId);
    await notifyUsers(
      tx,
      recipients.filter((id) => id !== actor.id),
      {
        type: "COMMENT_ADDED",
        title: `New comment: ${s.mda.code} — ${s.mda.name} (${s.budgetYear.year})`,
        body: `${actor.name}: ${text.slice(0, 200)}`,
        link: `/budget/workspace/${submissionId}/review`,
        entityType: "BudgetSubmission",
        entityId: submissionId,
      },
    );
    return comment;
  });
}

export async function listReviewData(submissionId: string) {
  const [steps, corrections, comments, reviews] = await Promise.all([
    prisma.approvalStep.findMany({ where: { submissionId }, orderBy: { createdAt: "asc" }, include: { version: { select: { label: true } } } }),
    prisma.correctionItem.findMany({ where: { submissionId }, orderBy: { createdAt: "desc" }, include: { review: { include: { reviewer: { select: { fullName: true } } } } } }),
    prisma.comment.findMany({ where: { submissionId, deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true, jobTitle: true } } } }),
    prisma.budgetReview.findMany({ where: { submissionId }, orderBy: { startedAt: "asc" }, include: { reviewer: { select: { fullName: true } } } }),
  ]);
  const userIds = [...new Set(corrections.flatMap((c) => [c.createdById, c.resolvedById, c.verifiedById]).filter(Boolean) as string[])];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return { steps, corrections, comments, reviews, userName: (id: string | null) => (id ? users.get(id) ?? null : null) };
}

export async function reviewerCandidates(mdaId: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { key: "review.stage1" } } } } } } },
    select: { id: true, fullName: true, jobTitle: true, mdaAssignments: { select: { mdaId: true } }, roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } } },
    orderBy: { fullName: "asc" },
  });
  return users
    .filter((u) => u.roles.some((r) => r.role.permissions.some((p) => p.permission.key === "scope.all_mdas")) || u.mdaAssignments.some((a) => a.mdaId === mdaId))
    .map((u) => ({ id: u.id, name: u.fullName, title: u.jobTitle }));
}

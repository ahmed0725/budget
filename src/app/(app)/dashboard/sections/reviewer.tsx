import { StatCard } from "@/components/app/stat-card";
import { SubmissionTable } from "@/components/budget/submission-table";
import { can, type Actor } from "@/lib/auth/actor";
import { getT } from "@/lib/i18n/server";
import { toSubmissionRow } from "@/lib/services/dto";
import { listSubmissions } from "@/lib/services/submissions";
import type { SubmissionStatus } from "@/generated/prisma/client";

/** Reviewer: assigned submissions, pending reviews, validation errors and budget changes. */
export async function ReviewerSection({ actor, year }: { actor: Actor; year: number }) {
  const { t } = await getT();
  // The statuses this reviewer acts on, by stage permission.
  const statuses: SubmissionStatus[] = [
    ...(can(actor, "review.stage1") ? (["SUBMITTED", "UNDER_REVIEW"] as const) : []),
    ...(can(actor, "review.stage2") ? (["RECOMMENDED"] as const) : []),
    ...(can(actor, "review.final") ? (["ENDORSED"] as const) : []),
  ];
  const [mine, queue] = await Promise.all([
    listSubmissions(actor, { year, assignedToMe: true, status: ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED"], pageSize: 50 }),
    listSubmissions(actor, { year, status: statuses, pageSize: 50, sort: "submittedAt.asc" }),
  ]);
  const errors = queue.rows.reduce((a, r) => a + r.validationErrors, 0);
  return (
    <section aria-labelledby="reviewer-title" className="space-y-3">
      <h2 id="reviewer-title" className="text-sm font-semibold">
        {t("dashboard.pendingReviews")} — {year}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t("dashboard.assignedToMe")} value={String(mine.total)} href={`/submissions/pending?year=${year}&mine=1`} />
        <StatCard label={t("dashboard.pendingReviews")} value={String(queue.total)} href={`/submissions/under-review?year=${year}`} />
        <StatCard label={t("dashboard.validationErrors")} value={String(errors)} hint={t("validation.title")} />
      </div>
      <SubmissionTable rows={queue.rows.map(toSubmissionRow)} hideYear tableKey="dashboard-review" emptyTitle={t("common.noResults")} />
    </section>
  );
}

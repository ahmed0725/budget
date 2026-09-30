/** Serializable view models passed from server components to client components. */
import type { SubmissionRow } from "@/components/budget/submission-table";
import type { listSubmissions } from "./submissions";

type ListRow = Awaited<ReturnType<typeof listSubmissions>>["rows"][number];

export function toSubmissionRow(s: ListRow): SubmissionRow {
  return {
    id: s.id,
    mdaCode: s.mda.code,
    mdaName: s.mda.name,
    mdaNameEn: s.mda.nameEn,
    sector: s.mda.sector.name,
    year: s.budgetYear.year,
    type: s.type,
    revisionNumber: s.revisionNumber,
    status: s.status,
    totalExpenditure: Number(s.totalExpenditure),
    totalRevenue: Number(s.totalRevenue),
    completion: s.completion,
    validationErrors: s.validationErrors,
    validationWarnings: s.validationWarnings,
    reviewer: s.assignedReviewer?.fullName ?? null,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    updatedAt: s.updatedAt.toISOString(),
    source: s.source,
  };
}

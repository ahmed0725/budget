import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@/generated/prisma/client";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { SubmissionTable } from "@/components/budget/submission-table";
import { mdaScope, visibleStatuses } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { param, readTableParams, resolveYear } from "@/lib/page-params";
import { toSubmissionRow } from "@/lib/services/dto";
import { filterOptions } from "@/lib/services/options";
import { listSubmissions } from "@/lib/services/submissions";
import { cn } from "@/lib/utils";

const QUEUES: Record<string, { label: "nav.pending" | "nav.underReview" | "nav.returned" | "nav.approved" | "nav.rejected"; statuses: SubmissionStatus[] }> = {
  pending: { label: "nav.pending", statuses: ["SUBMITTED"] },
  "under-review": { label: "nav.underReview", statuses: ["UNDER_REVIEW", "RECOMMENDED", "ENDORSED"] },
  returned: { label: "nav.returned", statuses: ["RETURNED"] },
  approved: { label: "nav.approved", statuses: ["APPROVED", "PUBLISHED"] },
  rejected: { label: "nav.rejected", statuses: ["REJECTED"] },
};

export default async function QueuePage(props: PageProps<"/submissions/[queue]">) {
  const actor = await requirePagePermission("submissions.view");
  const { queue } = await props.params;
  const cfg = QUEUES[queue];
  if (!cfg) notFound();
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const year = await resolveYear(sp);
  const table = readTableParams(sp);
  const assignedToMe = param(sp, "mine") === "1";
  const options = await filterOptions(actor, locale);
  const { rows, total } = await listSubmissions(actor, {
    year,
    status: cfg.statuses,
    sectorId: param(sp, "sector"),
    search: table.q,
    assignedToMe,
    sort: table.sort ?? "submittedAt.asc",
    page: table.page,
    pageSize: table.pageSize,
  });

  // Queue counts for the tab strip.
  const scope = mdaScope(actor);
  const visible = visibleStatuses(actor);
  const counts = await prisma.budgetSubmission.groupBy({
    by: ["status"],
    where: { budgetYear: { year }, ...(scope ? { mdaId: scope } : {}), ...(visible ? { status: { in: visible } } : {}) },
    _count: { _all: true },
  });
  const countFor = (statuses: SubmissionStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c._count._all, 0);

  return (
    <div>
      <PageHeader title={t(cfg.label)} description={`${t("nav.workflow")} · ${year}`} breadcrumbs={[{ label: t("nav.workflow") }, { label: t(cfg.label) }]} />
      <nav aria-label={t("nav.workflow")} className="mb-4 flex flex-wrap gap-1">
        {Object.entries(QUEUES).map(([key, q]) => (
          <Link
            key={key}
            href={`/submissions/${key}?year=${year}`}
            aria-current={key === queue ? "page" : undefined}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted", key === queue && "border-primary/40 bg-primary/5 font-medium text-primary")}
          >
            {t(q.label)}
            <span className="num rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{countFor(q.statuses)}</span>
          </Link>
        ))}
      </nav>
      <SubmissionTable
        rows={rows.map(toSubmissionRow)}
        total={total}
        page={table.page}
        pageSize={table.pageSize}
        sort={table.sort ?? "submittedAt.asc"}
        hideYear
        tableKey="queue"
        toolbar={
          <FilterBar
            filters={[
              { type: "select", key: "year", label: t("common.year"), options: options.years, required: true, width: "w-28", defaultValue: String(year) },
              { type: "select", key: "sector", label: t("common.sector"), options: options.sectors, width: "w-56" },
              { type: "select", key: "mine", label: t("dashboard.assignedToMe"), options: [{ value: "1", label: t("common.yes") }], width: "w-32" },
              { type: "search", key: "q", label: t("common.search") },
            ]}
          />
        }
      />
    </div>
  );
}

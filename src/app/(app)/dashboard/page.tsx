import type { Metadata } from "next";
import { can, isAgencyMember } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { managementAlerts } from "@/lib/services/analytics";
import { getSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/app/page-header";
import { AlertsPanel } from "./alerts-panel";
import { AgencySection } from "./sections/agency";
import { AdminSection } from "./sections/admin";
import { AuditorSection } from "./sections/auditor";
import { ExecutiveSection } from "./sections/executive";
import { ReviewerSection } from "./sections/reviewer";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requirePagePermission("dashboard.view");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const years = await prisma.budgetYear.findMany({ orderBy: { year: "desc" } });
  const executionYear = years.find((y) => y.status === "ACTIVE")?.year ?? years.find((y) => ["PUBLISHED", "CLOSED"].includes(y.status))?.year ?? new Date().getFullYear();
  const preparationYear = years.find((y) => ["PREPARATION", "REVIEW", "APPROVED"].includes(y.status))?.year;

  const isAgency = can(actor, "budget.prepare") && actor.assignments.some((a) => isAgencyMember(actor, a.mdaId));
  const isReviewer = can(actor, "review.stage1") || can(actor, "review.stage2") || can(actor, "review.final");
  const isAdmin = can(actor, "review.assign") || can(actor, "budget.publish") || can(actor, "admin.mda.manage");
  const isExecutive = can(actor, "dashboard.executive") || can(actor, "analysis.view");
  const isAuditor = can(actor, "audit.view");

  const alerts = await managementAlerts(actor, {
    preparationYear,
    executionYear,
    largeVariancePercent: settings.budget.largeVariancePercent,
    revenueAlertPercent: settings.budget.revenueAlertPercent,
    locale,
  });

  return (
    <div className="space-y-8">
      <PageHeader title={t("dashboard.title")} description={`${t("dashboard.subtitle", { year: executionYear })}${preparationYear ? ` · ${t("budget.workspaceTitle", { year: preparationYear })}` : ""}`} />
      {isAgency && preparationYear ? <AgencySection actor={actor} preparationYear={preparationYear} executionYear={executionYear} /> : null}
      <AlertsPanel alerts={alerts} />
      {isReviewer && preparationYear ? <ReviewerSection actor={actor} year={preparationYear} /> : null}
      {isAdmin && preparationYear && !actor.approvedOnly ? <AdminSection actor={actor} year={preparationYear} /> : null}
      {isExecutive || (!isAgency && !isReviewer && !isAdmin && !isAuditor) ? <ExecutiveSection actor={actor} executionYear={executionYear} preparationYear={preparationYear} /> : null}
      {isAuditor ? <AuditorSection actor={actor} /> : null}
    </div>
  );
}

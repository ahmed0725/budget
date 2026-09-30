/**
 * Navigation definition. Items are filtered on the server by the user's permissions
 * (never hard-coded per page); the client only renders what it receives.
 */
import type { PermissionKey } from "@/lib/auth/permissions";
import type { TranslationKey } from "@/lib/i18n";

export type NavIcon =
  | "dashboard"
  | "budget"
  | "execution"
  | "analysis"
  | "reports"
  | "workflow"
  | "admin"
  | "audit";

export interface NavItem {
  key: string;
  label: TranslationKey;
  href: string;
  anyOf: PermissionKey[];
}

export interface NavSection {
  key: string;
  label: TranslationKey;
  icon: NavIcon;
  href?: string;
  anyOf: PermissionKey[];
  items?: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  { key: "dashboard", label: "nav.dashboard", icon: "dashboard", href: "/dashboard", anyOf: ["dashboard.view"] },
  {
    key: "budget",
    label: "nav.budget",
    icon: "budget",
    anyOf: ["budget.view"],
    items: [
      { key: "years", label: "nav.budgetYears", href: "/budget/years", anyOf: ["budget.view"] },
      { key: "submissions", label: "nav.submissions", href: "/budget/submissions", anyOf: ["budget.view"] },
      { key: "items", label: "nav.budgetItems", href: "/budget/items", anyOf: ["budget.view"] },
      { key: "revenue", label: "nav.revenue", href: "/budget/revenue", anyOf: ["budget.view"] },
      { key: "expenditure", label: "nav.expenditure", href: "/budget/expenditure", anyOf: ["budget.view"] },
      { key: "personnel", label: "nav.personnel", href: "/budget/personnel", anyOf: ["budget.view"] },
      { key: "capital", label: "nav.capitalProjects", href: "/budget/capital-projects", anyOf: ["budget.view"] },
      { key: "procurement", label: "nav.procurement", href: "/budget/procurement", anyOf: ["budget.view"] },
      { key: "cashflow", label: "nav.cashFlow", href: "/budget/cash-flow", anyOf: ["budget.view"] },
    ],
  },
  {
    key: "execution",
    label: "nav.execution",
    icon: "execution",
    anyOf: ["execution.view"],
    items: [
      { key: "revenue", label: "nav.revenueExecution", href: "/execution/revenue", anyOf: ["execution.view"] },
      { key: "expenditure", label: "nav.expenditureExecution", href: "/execution/expenditure", anyOf: ["execution.view"] },
      { key: "commitments", label: "nav.commitments", href: "/execution/commitments", anyOf: ["execution.view"] },
      { key: "monthly", label: "nav.monthlyExecution", href: "/execution/monthly", anyOf: ["execution.view"] },
    ],
  },
  {
    key: "analysis",
    label: "nav.analysis",
    icon: "analysis",
    anyOf: ["analysis.view"],
    items: [
      { key: "budget", label: "nav.budgetAnalysis", href: "/analysis/budget", anyOf: ["analysis.view"] },
      { key: "variance", label: "nav.varianceAnalysis", href: "/analysis/variance", anyOf: ["analysis.view"] },
      { key: "mda", label: "nav.mdaComparison", href: "/analysis/mda-comparison", anyOf: ["analysis.view"] },
      { key: "multiyear", label: "nav.multiYear", href: "/analysis/multi-year", anyOf: ["analysis.view"] },
    ],
  },
  {
    key: "reports",
    label: "nav.reports",
    icon: "reports",
    anyOf: ["reports.view"],
    items: [
      { key: "budget", label: "nav.budgetReports", href: "/reports?group=budget", anyOf: ["reports.view"] },
      { key: "execution", label: "nav.executionReports", href: "/reports?group=execution", anyOf: ["reports.view"] },
      { key: "revenue", label: "nav.revenueReports", href: "/reports?group=revenue", anyOf: ["reports.view"] },
      { key: "expenditure", label: "nav.expenditureReports", href: "/reports?group=expenditure", anyOf: ["reports.view"] },
      { key: "custom", label: "nav.customReports", href: "/reports/custom", anyOf: ["reports.view"] },
    ],
  },
  {
    key: "workflow",
    label: "nav.workflow",
    icon: "workflow",
    anyOf: ["submissions.view"],
    items: [
      { key: "pending", label: "nav.pending", href: "/submissions/pending", anyOf: ["submissions.view"] },
      { key: "review", label: "nav.underReview", href: "/submissions/under-review", anyOf: ["submissions.view"] },
      { key: "returned", label: "nav.returned", href: "/submissions/returned", anyOf: ["submissions.view"] },
      { key: "approved", label: "nav.approved", href: "/submissions/approved", anyOf: ["submissions.view"] },
      { key: "rejected", label: "nav.rejected", href: "/submissions/rejected", anyOf: ["submissions.view"] },
    ],
  },
  {
    key: "admin",
    label: "nav.administration",
    icon: "admin",
    anyOf: ["admin.mda.manage", "admin.codes.manage", "admin.years.manage", "admin.users.manage", "admin.roles.manage", "admin.settings.manage", "admin.validation.manage", "import.run", "execution.manage"],
    items: [
      { key: "mdas", label: "nav.mdas", href: "/administration/mdas", anyOf: ["admin.mda.manage"] },
      { key: "codes", label: "nav.budgetCodes", href: "/administration/budget-codes", anyOf: ["admin.codes.manage"] },
      { key: "revenue-codes", label: "nav.revenueCodes", href: "/administration/budget-codes?kind=REVENUE", anyOf: ["admin.codes.manage"] },
      { key: "expenditure-codes", label: "nav.expenditureCodes", href: "/administration/budget-codes?kind=EXPENDITURE", anyOf: ["admin.codes.manage"] },
      { key: "years", label: "nav.budgetYears", href: "/administration/budget-years", anyOf: ["admin.years.manage"] },
      { key: "users", label: "nav.users", href: "/administration/users", anyOf: ["admin.users.manage"] },
      { key: "roles", label: "nav.roles", href: "/administration/roles", anyOf: ["admin.roles.manage"] },
      { key: "settings", label: "nav.settings", href: "/administration/settings", anyOf: ["admin.settings.manage", "admin.validation.manage"] },
      { key: "imports", label: "nav.imports", href: "/administration/imports", anyOf: ["import.run", "execution.manage", "admin.codes.manage"] },
    ],
  },
  {
    key: "audit",
    label: "nav.audit",
    icon: "audit",
    anyOf: ["audit.view"],
    items: [{ key: "logs", label: "nav.auditLogs", href: "/audit/logs", anyOf: ["audit.view"] }],
  },
];

export function navigationFor(permissions: ReadonlySet<string>): NavSection[] {
  const allowed = (anyOf: PermissionKey[]) => anyOf.some((p) => permissions.has(p));
  return NAVIGATION.filter((s) => allowed(s.anyOf))
    .map((s) => ({ ...s, items: s.items?.filter((i) => allowed(i.anyOf)) }))
    .filter((s) => s.href || (s.items && s.items.length > 0));
}

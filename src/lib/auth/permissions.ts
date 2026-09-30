/**
 * Permission registry. Permissions are stored in the database and assigned to roles
 * by administrators (Administration → Roles & Permissions). Code only ever checks
 * permission keys — never role names — so access is fully configurable.
 */

export const PERMISSIONS = {
  // Dashboards
  "dashboard.view": { group: "Dashboard", name: "View dashboard" },
  "dashboard.executive": { group: "Dashboard", name: "View executive dashboard" },

  // Budget preparation
  "budget.view": { group: "Budget", name: "View budgets" },
  "budget.prepare": { group: "Budget", name: "Prepare and edit draft budgets" },
  "budget.submit": { group: "Budget", name: "Submit budgets for review" },
  "budget.certify.prepare": { group: "Budget", name: "Sign certification as preparer" },
  "budget.certify.review": { group: "Budget", name: "Sign certification as reviewer (finance director)" },
  "budget.certify.approve": { group: "Budget", name: "Sign certification as accounting officer" },
  "budget.certify.hr": { group: "Budget", name: "Sign HR certification (Form E)" },
  "budget.version.restore": { group: "Budget", name: "Restore a previous draft version" },
  "budget.revision.create": { group: "Budget", name: "Create budget revisions" },

  // Workflow
  "submissions.view": { group: "Workflow", name: "View submission queues" },
  "review.stage1": { group: "Workflow", name: "Budget officer review (recommend / return)" },
  "review.stage2": { group: "Workflow", name: "Director review (endorse / return)" },
  "review.final": { group: "Workflow", name: "Final approval (approve / reject / return)" },
  "review.assign": { group: "Workflow", name: "Assign reviewers" },
  "budget.publish": { group: "Workflow", name: "Publish approved budgets" },
  "budget.reopen": { group: "Workflow", name: "Reopen rejected budgets" },

  // Execution
  "execution.view": { group: "Execution", name: "View budget execution" },
  "execution.manage": { group: "Execution", name: "Record actuals, targets and commitments" },

  // Analysis and reporting
  "analysis.view": { group: "Analysis", name: "Use analysis tools" },
  "reports.view": { group: "Reports", name: "View reports" },
  "reports.build": { group: "Reports", name: "Create custom reports" },
  "reports.export": { group: "Reports", name: "Export reports (PDF, Excel, CSV)" },

  // Data exchange
  "import.run": { group: "Data exchange", name: "Import Excel files" },
  "export.run": { group: "Data exchange", name: "Export budget data" },
  "attachments.upload": { group: "Data exchange", name: "Upload attachments" },
  "comments.create": { group: "Workflow", name: "Add comments" },

  // Administration
  "admin.mda.manage": { group: "Administration", name: "Manage MDAs" },
  "admin.codes.manage": { group: "Administration", name: "Manage budget classification codes" },
  "admin.years.manage": { group: "Administration", name: "Manage budget years" },
  "admin.users.manage": { group: "Administration", name: "Manage users" },
  "admin.roles.manage": { group: "Administration", name: "Manage roles and permissions" },
  "admin.settings.manage": { group: "Administration", name: "Manage system settings and lookups" },
  "admin.validation.manage": { group: "Administration", name: "Manage validation rules" },

  // Audit
  "audit.view": { group: "Audit", name: "View audit logs" },

  // Data scope
  "scope.all_mdas": { group: "Data scope", name: "Access all MDAs (otherwise assigned MDAs only)" },
  "scope.approved_only": { group: "Data scope", name: "Restricted to approved/published budget data" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export interface RoleDefinition {
  key: string;
  name: string;
  nameSo: string;
  description: string;
  permissions: PermissionKey[];
}

const reporting: PermissionKey[] = ["reports.view", "reports.export", "export.run"];

/** Default roles created by the seed. Administrators can change them afterwards. */
export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    key: "SYSTEM_ADMIN",
    name: "System Administrator",
    nameSo: "Maamulaha Nidaamka",
    description: "Full access to every module and setting.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "scope.approved_only"),
  },
  {
    key: "BUDGET_ADMIN",
    name: "Budget Administrator",
    nameSo: "Maamulaha Miisaaniyadda",
    description: "Manages budget structure, years, codes, templates and the preparation cycle.",
    permissions: [
      "dashboard.view",
      "budget.view",
      "budget.revision.create",
      "submissions.view",
      "review.assign",
      "budget.publish",
      "budget.reopen",
      "execution.view",
      "execution.manage",
      "analysis.view",
      ...reporting,
      "reports.build",
      "import.run",
      "attachments.upload",
      "comments.create",
      "admin.mda.manage",
      "admin.codes.manage",
      "admin.years.manage",
      "admin.settings.manage",
      "admin.validation.manage",
      "scope.all_mdas",
    ],
  },
  {
    key: "MDA_BUDGET_OFFICER",
    name: "MDA Budget Officer",
    nameSo: "Sarkaalka Miisaaniyadda Hay'adda",
    description: "Prepares and submits the budget of the assigned MDA.",
    permissions: [
      "dashboard.view",
      "budget.view",
      "budget.prepare",
      "budget.submit",
      "budget.certify.prepare",
      "budget.version.restore",
      "execution.view",
      ...reporting,
      "import.run",
      "attachments.upload",
      "comments.create",
    ],
  },
  {
    key: "MDA_FINANCE_OFFICER",
    name: "MDA Finance Officer",
    nameSo: "Agaasimaha Maaliyadda Hay'adda",
    description: "Reviews the agency budget internally, signs the reviewed-by certification and records execution.",
    permissions: [
      "dashboard.view",
      "budget.view",
      "budget.prepare",
      "budget.submit",
      "budget.certify.review",
      "budget.certify.hr",
      "execution.view",
      "execution.manage",
      ...reporting,
      "attachments.upload",
      "comments.create",
    ],
  },
  {
    key: "MDA_ACCOUNTING_OFFICER",
    name: "MDA Accounting Officer",
    nameSo: "Mas'uulka Xisaab-celinta Hay'adda",
    description: "Head of the agency; signs the approved-by certification before submission.",
    permissions: ["dashboard.view", "budget.view", "budget.submit", "budget.certify.approve", "execution.view", ...reporting, "comments.create"],
  },
  {
    key: "BUDGET_ANALYST",
    name: "Budget Analyst",
    nameSo: "Falanqeeyaha Miisaaniyadda",
    description: "Analyses budgets and execution across all MDAs.",
    permissions: ["dashboard.view", "budget.view", "submissions.view", "execution.view", "analysis.view", ...reporting, "reports.build", "scope.all_mdas"],
  },
  {
    key: "BUDGET_REVIEWER",
    name: "Budget Reviewer",
    nameSo: "Dib-u-eegaha Miisaaniyadda",
    description: "Ministry of Finance budget officer who reviews submitted budgets and recommends or returns them.",
    permissions: [
      "dashboard.view",
      "budget.view",
      "submissions.view",
      "review.stage1",
      "execution.view",
      "analysis.view",
      ...reporting,
      "comments.create",
      "attachments.upload",
      "scope.all_mdas",
    ],
  },
  {
    key: "DIRECTOR",
    name: "Director / Senior Reviewer",
    nameSo: "Agaasimaha / Dib-u-eegaha Sare",
    description: "Higher-level review; endorses recommended budgets or returns them.",
    permissions: [
      "dashboard.view",
      "dashboard.executive",
      "budget.view",
      "submissions.view",
      "review.stage2",
      "review.assign",
      "execution.view",
      "analysis.view",
      ...reporting,
      "reports.build",
      "comments.create",
      "scope.all_mdas",
    ],
  },
  {
    key: "APPROVAL_AUTHORITY",
    name: "Approval Authority",
    nameSo: "Hay'adda Ansixinta",
    description: "Gives final approval to endorsed budgets, or rejects/returns them.",
    permissions: [
      "dashboard.view",
      "dashboard.executive",
      "budget.view",
      "submissions.view",
      "review.final",
      "budget.publish",
      "execution.view",
      "analysis.view",
      ...reporting,
      "comments.create",
      "scope.all_mdas",
    ],
  },
  {
    key: "EXECUTIVE_VIEWER",
    name: "Executive Viewer",
    nameSo: "Daawadaha Hoggaanka",
    description: "Read-only executive dashboards over approved budget information.",
    permissions: ["dashboard.view", "dashboard.executive", "budget.view", "execution.view", "analysis.view", "reports.view", "reports.export", "scope.all_mdas", "scope.approved_only"],
  },
  {
    key: "AUDITOR",
    name: "Auditor",
    nameSo: "Hanti-dhowraha",
    description: "Read-only access to records, versions and audit trails.",
    permissions: ["dashboard.view", "budget.view", "submissions.view", "execution.view", "analysis.view", ...reporting, "audit.view", "scope.all_mdas"],
  },
];

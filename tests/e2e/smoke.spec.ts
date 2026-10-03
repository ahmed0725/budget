import { expect, test, type Page } from "@playwright/test";
import { withConnection } from "../../scripts/mysql.mjs";
import { signIn } from "./helpers";

/**
 * Every page and export renders without a server error — including search, sorting and
 * filter variants that exercise the hand-written SQL (analytics, drill-down, reports).
 */
const REPORTS = ["budget-summary", "revenue", "expenditure", "mda-budget", "budget-execution", "variance", "personnel", "capital-projects", "procurement", "cash-flow", "revenue-collection", "budget-comparison", "historical", "submission-status", "audit"];

const PAGES = [
  "/dashboard",
  "/dashboard?year=2026",
  "/budget/years",
  "/budget/submissions",
  "/budget/submissions?search=min&sort=submittedAt",
  "/budget/items?year=2027",
  "/budget/items?year=2026&q=salar",
  "/budget/revenue?year=2026",
  "/budget/expenditure?year=2026",
  "/budget/personnel?year=2027",
  "/budget/procurement?year=2027",
  "/budget/cash-flow?year=2027",
  "/budget/capital-projects?year=2027&q=road",
  "/analysis/budget",
  "/analysis/budget?year=2025",
  "/analysis/drilldown",
  "/analysis/drilldown?year=2026&kind=REVENUE",
  "/analysis/mda-comparison",
  "/analysis/multi-year",
  "/analysis/variance",
  "/execution/monthly",
  "/execution/expenditure",
  "/execution/revenue",
  "/execution/commitments?q=a",
  "/reports",
  "/reports/custom",
  ...REPORTS.map((k) => `/reports/${k}`),
  "/submissions/pending",
  "/notifications",
  "/profile",
  "/audit/logs",
  "/audit/logs?q=budget",
  "/administration/users",
  "/administration/users?q=officer&sort=lastLogin",
  "/administration/users/new",
  "/administration/roles",
  "/administration/mdas",
  "/administration/mdas?q=minist",
  "/administration/budget-codes",
  "/administration/budget-codes?q=salar",
  "/administration/budget-years",
  "/administration/imports",
  "/administration/imports/new",
  "/administration/settings",
];

async function expectHealthy(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status() ?? 0, path).toBeLessThan(500);
  await expect(page.getByText("Something needs attention"), path).toHaveCount(0);
}

/** Id of the first row of `sql` in the database prepared for this run. */
async function firstId(sql: string): Promise<string> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("Run the end-to-end tests with `npm run test:e2e`.");
  const rows = await withConnection(url, (c) => c.query(sql));
  expect(rows.length, sql).toBeGreaterThan(0);
  return rows[0].id;
}

test.describe("smoke", () => {
  test.setTimeout(300_000);

  test("every page renders for the system administrator", async ({ page }) => {
    await signIn(page, "admin");
    for (const path of PAGES) await expectHealthy(page, path);
    await expectHealthy(page, `/administration/users/${await firstId("SELECT id FROM users WHERE username = 'officer.10101'")}`);
    await expectHealthy(page, `/administration/mdas/${await firstId("SELECT id FROM mdas ORDER BY code LIMIT 1")}`);
    await expectHealthy(page, `/administration/imports/${await firstId("SELECT id FROM imports ORDER BY createdAt LIMIT 1")}`);
  });

  test("every budget workspace tab and export renders for the executive", async ({ page }) => {
    await signIn(page, "executive");
    const ids = [
      await firstId("SELECT s.id FROM budget_submissions s JOIN budget_years y ON y.id = s.budgetYearId WHERE y.year = 2026 AND s.status IN ('APPROVED','PUBLISHED') ORDER BY s.id LIMIT 1"),
      await firstId("SELECT s.id FROM budget_submissions s JOIN budget_years y ON y.id = s.budgetYearId WHERE y.year = 2027 ORDER BY s.id LIMIT 1"),
    ];
    for (const id of ids) {
      for (const tab of ["", "/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/attachments", "/certification", "/history", "/review", "/validation"]) await expectHealthy(page, `/budget/workspace/${id}${tab}`);
    }
    for (const path of [...ids.map((id) => `/api/export/submission/${id}`), "/api/export/execution", "/api/notifications", ...REPORTS.map((k) => `/api/reports/${k}?format=xlsx`)]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBeLessThan(500);
    }
  });
});

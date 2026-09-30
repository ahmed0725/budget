import { expect, test } from "@playwright/test";
import { password, signIn } from "./helpers";

test.describe("authentication", () => {
  test("rejects a wrong password and explains why", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#identifier").fill("officer.10101");
    await page.locator("#password").fill(`${password()}-wrong`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("The username or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects anonymous visitors to the sign-in page and back after signing in", async ({ page }) => {
    await page.goto("/budget/years");
    await expect(page).toHaveURL(/\/login\?next=%2Fbudget%2Fyears/);
    await page.locator("#identifier").fill("analyst");
    await page.locator("#password").fill(password());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/budget\/years/);
    await expect(page.getByRole("heading", { name: "Budget Years" })).toBeVisible();
  });
});

test.describe("agency budget officer", () => {
  test("edits a draft budget line in place and the change persists", async ({ page }) => {
    await signIn(page, "officer.10101");
    await page.goto("/budget/items?year=2027");
    const amount = page.getByRole("textbox", { name: /^Amount 10101 211101/ });
    await expect(amount).toBeEditable();
    await amount.fill("123456");
    await amount.press("Enter");
    await expect(page.getByText("Saved").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: /^Amount 10101 211101/ })).toHaveValue("123456");
  });

  test("sees why the draft cannot be submitted yet", async ({ page }) => {
    await signIn(page, "officer.10101");
    await page.goto("/budget/years");
    await page.getByRole("link", { name: /10101/ }).first().click();
    await expect(page).toHaveURL(/\/budget\/workspace\//);
    await page.goto(page.url().replace(/\/budget\/workspace\/([^/]+).*/, "/budget/workspace/$1/validation"));
    await expect(page.getByText("Errors must be resolved before the budget can be submitted.")).toBeVisible();
  });

  test("cannot open administration pages", async ({ page }) => {
    await signIn(page, "officer.10101");
    // Pages stream behind a loading state, so the refusal is rendered in the page (HTTP 200)
    // rather than as a 403 status; no user data is sent.
    await page.goto("/administration/users");
    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(page.getByText("officer.10101@budget.dev.local")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Username" })).toHaveCount(0);
  });
});

test.describe("review and reporting", () => {
  test("the budget reviewer sees submitted budgets in the pending queue", async ({ page }) => {
    await signIn(page, "reviewer");
    await page.goto("/submissions/pending");
    await expect(page.getByText(/40101/).first()).toBeVisible();
  });

  test("the executive runs a report and exports it", async ({ page }) => {
    await signIn(page, "executive");
    await page.goto("/reports/budget-summary?year=2026&dataset=approved");
    await expect(page.getByRole("heading", { name: "Budget Summary Report 2026" })).toBeVisible();
    await expect(page.getByText("$16,222,526.42").first()).toBeVisible();
    const pdf = await page.request.get("/api/reports/budget-summary?format=pdf&year=2026&dataset=approved");
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  });
});

test.describe("language", () => {
  test("switches the interface to Somali and back", async ({ page }) => {
    await signIn(page, "admin");
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitemradio", { name: "Somali" }).click();
    await expect(page.getByRole("link", { name: "Guddiga Guud" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Luqadda" }).click();
    await page.getByRole("menuitemradio", { name: /English|Ingiriisi/ }).click();
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  });
});

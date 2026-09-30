import { expect, type Page } from "@playwright/test";

/** Password of the development accounts seeded for this run (set by scripts/e2e.mjs). */
export function password(): string {
  const p = process.env.E2E_PASSWORD;
  if (!p) throw new Error("Run the end-to-end tests with `npm run test:e2e`.");
  return p;
}

export async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#identifier").fill(username);
  await page.locator("#password").fill(password());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

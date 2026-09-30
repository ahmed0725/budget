import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests. Run with `npm run test:e2e` (after `npm run build`): the runner
 * prepares a throwaway database and passes it in E2E_DATABASE_URL.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Microsoft Edge ships with Windows, so no browser download is needed.
    channel: process.env.E2E_CHANNEL ?? "msedge",
    locale: "en-GB",
    timezoneId: "Africa/Mogadishu",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: databaseUrl
    ? {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/api/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: databaseUrl,
          STORAGE_DIR: process.env.STORAGE_DIR ?? ".data/e2e-storage",
          AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret",
          SECURE_COOKIES: "false",
        },
      }
    : undefined,
});

/**
 * Database seed.
 *
 *  1. System configuration (roles, permissions, settings, lookups, categories, rules, years)
 *  2. Reference data extracted from data/reference/Final Draft Budget 2027.xlsx
 *     (chart of accounts, MDAs, summary-code crosswalk)
 *  3. DEVELOPMENT SEED DATA (marked isDevSeed / source = DEV_SEED):
 *     sample users, historical budgets loaded through the import pipeline, the 2027
 *     preparation cycle in every workflow state, and execution records.
 *
 * Run on an empty database: `npm run db:reset` (migrations + seed).
 * Set SEED_SKIP_DEV=true to load only system configuration and reference data.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { readWorkbook } from "../src/lib/imports/workbook";
import { detectBudgetWorkbook, suggestBudgetWorkbookOptions } from "../src/lib/imports/profiles/budget-workbook";
import { LEGACY_CROSSWALK } from "../src/lib/imports/reference-data";
import { seedExecution } from "./seed/execution";
import { seedHistorical } from "./seed/historical";
import { seedPreparation } from "./seed/preparation";
import { seedReference } from "./seed/reference";
import { seedSystem } from "./seed/system";
import { seedUsers } from "./seed/users";

const WORKBOOK = path.resolve("data/reference/Final Draft Budget 2027.xlsx");

async function main() {
  const started = Date.now();
  const step = (label: string) => console.log(`\n▶ ${label}`);

  step("System configuration");
  await seedSystem(prisma);

  step("Reference data from the budget workbook");
  const buffer = readFileSync(WORKBOOK);
  const wb = await readWorkbook(buffer);
  const detection = detectBudgetWorkbook(wb);
  const options = suggestBudgetWorkbookOptions(wb, detection, { legacyNames: LEGACY_CROSSWALK, preparationYear: 2027, revenueMdaCode: "10301" });
  const ref = await seedReference(prisma, wb, options);
  console.log(`  ${ref.codes} classification codes, ${ref.mdas} MDAs`);

  if (process.env.SEED_SKIP_DEV === "true") {
    console.log("\nSEED_SKIP_DEV=true — development data skipped.");
    return;
  }
  if ((await prisma.budgetSubmission.count()) > 0) {
    console.log("\nBudget data already present — development data not re-seeded (run `npm run db:reset` for a clean database).");
    return;
  }

  step("DEV SEED — users");
  const users = await seedUsers(prisma);
  console.log(`  ${Object.keys(users).length} development accounts (see README)`);

  step("Historical budgets 2024–2026 via the import pipeline");
  const hist = await seedHistorical(prisma, { path: WORKBOOK, buffer }, options, wb, users["admin"]);
  console.log(`  rows: ${JSON.stringify(hist.counts)}`);
  console.log(`  ${hist.commit.submissionsCreated} approved budgets, ${hist.commit.linesWritten} lines`);
  for (const r of hist.reconciliation.filter((x) => x.status === "DIFFERENCE")) console.log(`  reconciliation: ${r.label} — difference ${r.difference.toLocaleString("en-US")}`);

  step("DEV SEED — execution records");
  const exec = await seedExecution(prisma);
  console.log(`  ${exec.expRows} expenditure rows, ${exec.revRows} revenue rows, ${exec.commitments} commitments`);

  step("DEV SEED — 2027 preparation cycle");
  const prep = await seedPreparation(prisma, users);
  console.log(`  ${Object.keys(prep).length} submissions prepared through the workflow`);

  console.log(`\n✓ Seed completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

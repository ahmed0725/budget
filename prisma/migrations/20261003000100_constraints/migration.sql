-- Uniqueness and value constraints that the Prisma schema cannot express.
-- (Triggers that lock approved budgets and keep audit tables append-only are in
-- prisma/sql/integrity.sql, applied by `npm run db:deploy`.)

-- ─────────────────────────────────────────────────────────────────────────────
-- Budget lines: one line per code per submission for ordinary lines, and one
-- allocation line per capital project per submission. MySQL has no partial
-- indexes, so ordinary lines are keyed on a generated column ('' when the line is
-- not a capital-project line). Rows with a NULL project are distinct in the second
-- index, which therefore only constrains project lines.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `budget_lines`
  ADD COLUMN `lineProjectKey` VARCHAR(191) AS (IFNULL(`capitalProjectId`, '')) STORED;
CREATE UNIQUE INDEX `budget_lines_submission_code_uq` ON `budget_lines` (`submissionId`, `budgetCodeId`, `lineProjectKey`);
CREATE UNIQUE INDEX `budget_lines_submission_project_uq` ON `budget_lines` (`submissionId`, `capitalProjectId`);

-- ─────────────────────────────────────────────────────────────────────────────
-- Value constraints (enforced by MySQL 8.0.16+ and MariaDB 10.2+)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_amount_nonnegative` CHECK (`amount` >= 0);
ALTER TABLE `personnel_budgets` ADD CONSTRAINT `personnel_budgets_values_nonnegative`
  CHECK (`approvedEstablishment` >= 0 AND `filledPositions` >= 0 AND `monthlyCost` >= 0 AND `annualCost` >= 0);
ALTER TABLE `procurement_plans` ADD CONSTRAINT `procurement_plans_cost_nonnegative` CHECK (`estimatedCost` >= 0);
ALTER TABLE `cash_flow_forecasts` ADD CONSTRAINT `cash_flow_forecasts_amount_nonnegative` CHECK (`amount` >= 0);
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_amount_positive` CHECK (`amount` > 0);
ALTER TABLE `expenditure_execution` ADD CONSTRAINT `expenditure_execution_month_range` CHECK (`month` BETWEEN 1 AND 12);
ALTER TABLE `revenue_execution` ADD CONSTRAINT `revenue_execution_month_range` CHECK (`month` BETWEEN 1 AND 12);
ALTER TABLE `capital_projects` ADD CONSTRAINT `capital_projects_cost_nonnegative` CHECK (`totalCost` >= 0 AND `spentToDate` >= 0);
ALTER TABLE `budget_codes` ADD CONSTRAINT `budget_codes_effective_range`
  CHECK (`effectiveToYear` IS NULL OR `effectiveToYear` >= `effectiveFromYear`);

-- Data integrity protections and compatibility views.
--
-- Maintenance bypass: a database administrator (or the test harness) may run
--   SET LOCAL gbms.maintenance = 'on';
-- inside a transaction to perform controlled maintenance. The application never sets it.

-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only tables: audit_logs, approval_steps, budget_versions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gbms_block_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('gbms.maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_append_only();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION gbms_block_append_only();

CREATE TRIGGER approval_steps_append_only BEFORE UPDATE OR DELETE ON "approval_steps"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_append_only();
CREATE TRIGGER approval_steps_no_truncate BEFORE TRUNCATE ON "approval_steps"
  FOR EACH STATEMENT EXECUTE FUNCTION gbms_block_append_only();

CREATE TRIGGER budget_versions_append_only BEFORE UPDATE OR DELETE ON "budget_versions"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_append_only();
CREATE TRIGGER budget_versions_no_truncate BEFORE TRUNCATE ON "budget_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION gbms_block_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- Approved (locked) submissions: form data may not change
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gbms_block_locked_children() RETURNS trigger AS $$
DECLARE
  locked boolean;
BEGIN
  IF current_setting('gbms.maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "isLocked" INTO locked FROM "budget_submissions" WHERE id = OLD."submissionId";
    IF locked THEN
      RAISE EXCEPTION 'Budget submission % is approved and locked; % on % is not permitted',
        OLD."submissionId", TG_OP, TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "isLocked" INTO locked FROM "budget_submissions" WHERE id = NEW."submissionId";
    IF locked THEN
      RAISE EXCEPTION 'Budget submission % is approved and locked; % on % is not permitted',
        NEW."submissionId", TG_OP, TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budget_lines_locked BEFORE INSERT OR UPDATE OR DELETE ON "budget_lines"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();
CREATE TRIGGER personnel_budgets_locked BEFORE INSERT OR UPDATE OR DELETE ON "personnel_budgets"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();
CREATE TRIGGER procurement_plans_locked BEFORE INSERT OR UPDATE OR DELETE ON "procurement_plans"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();
CREATE TRIGGER cash_flow_forecasts_locked BEFORE INSERT OR UPDATE OR DELETE ON "cash_flow_forecasts"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();
CREATE TRIGGER submission_notes_locked BEFORE INSERT OR UPDATE OR DELETE ON "submission_notes"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();
CREATE TRIGGER certifications_locked BEFORE INSERT OR UPDATE OR DELETE ON "certifications"
  FOR EACH ROW EXECUTE FUNCTION gbms_block_locked_children();

CREATE OR REPLACE FUNCTION gbms_protect_submission() RETURNS trigger AS $$
BEGIN
  IF current_setting('gbms.maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."isLocked" OR OLD.status IN ('APPROVED', 'PUBLISHED') THEN
      RAISE EXCEPTION 'Approved budget submission % cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."isLocked" THEN
    IF NOT NEW."isLocked" THEN
      RAISE EXCEPTION 'Approved budget submission % cannot be unlocked; create a revision instead', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status NOT IN ('APPROVED', 'PUBLISHED')
       OR NEW."budgetYearId" IS DISTINCT FROM OLD."budgetYearId"
       OR NEW."mdaId" IS DISTINCT FROM OLD."mdaId"
       OR NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber"
       OR NEW."allocationNumber" IS DISTINCT FROM OLD."allocationNumber"
       OR NEW."agencyCategory" IS DISTINCT FROM OLD."agencyCategory"
       OR NEW."accountingOfficer" IS DISTINCT FROM OLD."accountingOfficer"
       OR NEW."contactPerson" IS DISTINCT FROM OLD."contactPerson"
       OR NEW."telephone" IS DISTINCT FROM OLD."telephone"
       OR NEW."email" IS DISTINCT FROM OLD."email"
       OR NEW."totalRevenue" IS DISTINCT FROM OLD."totalRevenue"
       OR NEW."totalExpenditure" IS DISTINCT FROM OLD."totalExpenditure"
       OR NEW."totalRecurrent" IS DISTINCT FROM OLD."totalRecurrent"
       OR NEW."totalPersonnel" IS DISTINCT FROM OLD."totalPersonnel"
       OR NEW."totalCapital" IS DISTINCT FROM OLD."totalCapital"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById" THEN
      RAISE EXCEPTION 'Approved budget submission % is immutable; only publication and supersession may be recorded', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budget_submissions_protect BEFORE UPDATE OR DELETE ON "budget_submissions"
  FOR EACH ROW EXECUTE FUNCTION gbms_protect_submission();

-- ─────────────────────────────────────────────────────────────────────────────
-- Uniqueness that Prisma cannot express (partial unique indexes)
-- ─────────────────────────────────────────────────────────────────────────────
-- One line per budget code per submission for ordinary lines…
CREATE UNIQUE INDEX "budget_lines_submission_code_uq"
  ON "budget_lines" ("submissionId", "budgetCodeId") WHERE "capitalProjectId" IS NULL;
-- …and one allocation line per capital project per submission.
CREATE UNIQUE INDEX "budget_lines_submission_project_uq"
  ON "budget_lines" ("submissionId", "capitalProjectId") WHERE "capitalProjectId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Value constraints
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "personnel_budgets" ADD CONSTRAINT "personnel_budgets_values_nonnegative"
  CHECK ("approvedEstablishment" >= 0 AND "filledPositions" >= 0 AND "monthlyCost" >= 0 AND "annualCost" >= 0);
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_cost_nonnegative" CHECK ("estimatedCost" >= 0);
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "expenditure_execution" ADD CONSTRAINT "expenditure_execution_month_range" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "revenue_execution" ADD CONSTRAINT "revenue_execution_month_range" CHECK ("month" BETWEEN 1 AND 12);
ALTER TABLE "capital_projects" ADD CONSTRAINT "capital_projects_cost_nonnegative" CHECK ("totalCost" >= 0 AND "spentToDate" >= 0);
ALTER TABLE "budget_codes" ADD CONSTRAINT "budget_codes_effective_range"
  CHECK ("effectiveToYear" IS NULL OR "effectiveToYear" >= "effectiveFromYear");

-- ─────────────────────────────────────────────────────────────────────────────
-- Compatibility views (revenue/expenditure codes and lines share normalised tables)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW "revenue_codes" AS SELECT * FROM "budget_codes" WHERE "kind" = 'REVENUE';
CREATE VIEW "expenditure_codes" AS SELECT * FROM "budget_codes" WHERE "kind" = 'EXPENDITURE';
CREATE VIEW "revenue_lines" AS SELECT * FROM "budget_lines" WHERE "kind" = 'REVENUE';
CREATE VIEW "expenditure_lines" AS SELECT * FROM "budget_lines" WHERE "kind" = 'EXPENDITURE';

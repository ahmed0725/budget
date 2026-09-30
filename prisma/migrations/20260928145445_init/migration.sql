-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('REVENUE', 'EXPENDITURE');

-- CreateEnum
CREATE TYPE "BudgetYearStatus" AS ENUM ('DRAFT', 'PREPARATION', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'ENDORSED', 'RETURNED', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('ORIGINAL', 'REVISION');

-- CreateEnum
CREATE TYPE "RevisionType" AS ENUM ('SUPPLEMENTARY', 'REALLOCATION', 'BUDGET_CUT', 'BUDGET_INCREASE', 'AGENCY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SummaryGroup" AS ENUM ('PERSONNEL', 'GOODS_SERVICES', 'CAPITAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LookupCategory" AS ENUM ('AGENCY_TYPE', 'REGION', 'MDA_CATEGORY', 'FUNDING_SOURCE', 'PROCUREMENT_METHOD');

-- CreateEnum
CREATE TYPE "Quarter" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- CreateEnum
CREATE TYPE "FormCode" AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('NEW', 'ONGOING');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('GOVERNMENT', 'DONOR', 'MIXED');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('PREPARATION', 'BUDGET_OFFICER_REVIEW', 'DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'PUBLICATION');

-- CreateEnum
CREATE TYPE "WorkflowAction" AS ENUM ('CREATE', 'SUBMIT', 'RESUBMIT', 'START_REVIEW', 'RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'RETURN', 'PUBLISH', 'REOPEN', 'ASSIGN', 'REVISION_CREATED', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'RETURN');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED', 'REOPENED');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('BUDGET_JUSTIFICATION', 'PROJECT_PROPOSAL', 'PROCUREMENT_DOCUMENT', 'STAFFING_JUSTIFICATION', 'APPROVAL_LETTER', 'OFFICIAL_STAMP', 'SIGNED_CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BUDGET_SUBMITTED', 'BUDGET_RETURNED', 'BUDGET_APPROVED', 'BUDGET_REJECTED', 'BUDGET_PUBLISHED', 'CORRECTION_REQUIRED', 'CORRECTION_RESOLVED', 'DEADLINE_APPROACHING', 'REVIEW_ASSIGNED', 'REVIEW_STAGE_ADVANCED', 'IMPORT_COMPLETED', 'VALIDATION_ERROR', 'COMMENT_ADDED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('COMMITTED', 'OBLIGATED', 'LIQUIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'SKIPPED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'SUBMIT', 'RETURN', 'RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'PUBLISH', 'REOPEN', 'CERTIFY', 'IMPORT', 'EXPORT', 'PERMISSION_CHANGE', 'VALIDATE', 'ASSIGN');

-- CreateEnum
CREATE TYPE "MdaAssignmentType" AS ENUM ('BUDGET_OFFICER', 'FINANCE_OFFICER', 'ACCOUNTING_OFFICER', 'REVIEWER', 'VIEWER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "isDevSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameSo" TEXT,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "user_mda_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "type" "MdaAssignmentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mda_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_values" (
    "id" TEXT NOT NULL,
    "category" "LookupCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "shortName" TEXT,
    "sectorId" TEXT NOT NULL,
    "parentId" TEXT,
    "agencyTypeId" TEXT,
    "regionId" TEXT,
    "categoryId" TEXT,
    "accountingOfficer" TEXT,
    "financeDirector" TEXT,
    "budgetOfficer" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDevSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mdas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_years" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "preparationStart" DATE,
    "preparationEnd" DATE,
    "submissionDeadline" DATE,
    "reviewStart" DATE,
    "reviewEnd" DATE,
    "approvalStart" DATE,
    "approvalEnd" DATE,
    "executionStart" DATE,
    "executionEnd" DATE,
    "closingDate" DATE,
    "status" "BudgetYearStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameSo" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "summaryGroup" "SummaryGroup",
    "isCapital" BOOLEAN NOT NULL DEFAULT false,
    "procurementEligible" BOOLEAN NOT NULL DEFAULT false,
    "defaultCodeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "kind" "BudgetKind" NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "categoryId" TEXT,
    "isPostable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFromYear" INTEGER NOT NULL,
    "effectiveToYear" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_mappings" (
    "id" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT,
    "targetCodeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "validation_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameSo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "ValidationSeverity" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tolerance" DECIMAL(18,2) NOT NULL DEFAULT 1,
    "params" JSONB,
    "form" "FormCode" NOT NULL,
    "field" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_submissions" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "type" "SubmissionType" NOT NULL DEFAULT 'ORIGINAL',
    "revisionType" "RevisionType",
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "parentSubmissionId" TEXT,
    "revisionReason" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "allocationNumber" TEXT,
    "agencyCategory" TEXT,
    "accountingOfficer" TEXT,
    "contactPerson" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "assignedReviewerId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "totalRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalExpenditure" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalRecurrent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPersonnel" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCapital" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "completion" INTEGER NOT NULL DEFAULT 0,
    "validationErrors" INTEGER NOT NULL DEFAULT 0,
    "validationWarnings" INTEGER NOT NULL DEFAULT 0,
    "validationPassed" INTEGER NOT NULL DEFAULT 0,
    "lastValidatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_versions" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "changes" JSONB,
    "isImmutable" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "capitalProjectId" TEXT,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "priorYearActual" DECIMAL(18,2),
    "currentYearEstimate" DECIMAL(18,2),
    "justification" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_budgets" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "positionTitle" TEXT NOT NULL,
    "grade" TEXT,
    "department" TEXT,
    "budgetCodeId" TEXT,
    "approvedEstablishment" INTEGER NOT NULL DEFAULT 0,
    "filledPositions" INTEGER NOT NULL DEFAULT 0,
    "monthlyCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_projects" (
    "id" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "projectCode" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "justification" TEXT,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "spentToDate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fundingSourceId" TEXT,
    "fundingType" "FundingType" NOT NULL DEFAULT 'GOVERNMENT',
    "projectType" "ProjectType" NOT NULL DEFAULT 'NEW',
    "isMultiYear" BOOLEAN NOT NULL DEFAULT false,
    "startYear" INTEGER,
    "expectedCompletionDate" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PROPOSED',
    "isDevSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "capital_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_plans" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "estimatedCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "procurementMethodId" TEXT,
    "quarter" "Quarter" NOT NULL,
    "responsibleDepartment" TEXT,
    "budgetCategoryId" TEXT,
    "capitalProjectId" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_forecasts" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "quarter" "Quarter" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_notes" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "form" "FormCode" NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "preparedByName" TEXT,
    "preparedByTitle" TEXT,
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "preparedSignature" TEXT,
    "reviewedByName" TEXT,
    "reviewedByTitle" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedSignature" TEXT,
    "approvedByName" TEXT,
    "approvedByTitle" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedSignature" TEXT,
    "hrCertifiedByName" TEXT,
    "hrCertifiedById" TEXT,
    "hrCertifiedAt" TIMESTAMP(3),
    "stampAttachmentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_checks" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "severity" "ValidationSeverity" NOT NULL,
    "calculated" DECIMAL(18,2),
    "expected" DECIMAL(18,2),
    "difference" DECIMAL(18,2),
    "message" TEXT NOT NULL,
    "action" TEXT,
    "form" "FormCode" NOT NULL,
    "field" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "versionId" TEXT,
    "stage" "WorkflowStage" NOT NULL,
    "action" "WorkflowAction" NOT NULL,
    "fromStatus" "SubmissionStatus",
    "toStatus" "SubmissionStatus" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_reviews" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision",
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "budget_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_items" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewId" TEXT,
    "form" "FormCode" NOT NULL,
    "section" TEXT,
    "field" TEXT,
    "comment" TEXT NOT NULL,
    "requiredCorrection" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "form" "FormCode",
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "form" "FormCode",
    "section" TEXT,
    "category" "AttachmentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_execution" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "capitalProjectId" TEXT,
    "lineKey" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "revisedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sourceSubmissionId" TEXT NOT NULL,
    "revisionSubmissionId" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenditure_execution" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenditure_execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_execution" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "mdaId" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "commitmentDate" DATE NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'COMMITTED',
    "obligatedAt" TIMESTAMP(3),
    "liquidatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "budgetYearId" TEXT,
    "mdaId" TEXT,
    "options" JSONB,
    "detected" JSONB,
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "issues" JSONB NOT NULL,
    "resolution" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "mdaId" TEXT,
    "budgetYearId" TEXT,
    "summary" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_mda_assignments_mdaId_idx" ON "user_mda_assignments"("mdaId");

-- CreateIndex
CREATE UNIQUE INDEX "user_mda_assignments_userId_mdaId_type_key" ON "user_mda_assignments"("userId", "mdaId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sectors_code_key" ON "sectors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_category_code_key" ON "lookup_values"("category", "code");

-- CreateIndex
CREATE UNIQUE INDEX "mdas_code_key" ON "mdas"("code");

-- CreateIndex
CREATE INDEX "mdas_sectorId_idx" ON "mdas"("sectorId");

-- CreateIndex
CREATE INDEX "mdas_isActive_idx" ON "mdas"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "budget_years_year_key" ON "budget_years"("year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_code_key" ON "budget_categories"("code");

-- CreateIndex
CREATE INDEX "budget_codes_kind_path_idx" ON "budget_codes"("kind", "path");

-- CreateIndex
CREATE INDEX "budget_codes_parentId_idx" ON "budget_codes"("parentId");

-- CreateIndex
CREATE INDEX "budget_codes_categoryId_idx" ON "budget_codes"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_codes_kind_code_effectiveFromYear_key" ON "budget_codes"("kind", "code", "effectiveFromYear");

-- CreateIndex
CREATE UNIQUE INDEX "code_mappings_scheme_sourceCode_key" ON "code_mappings"("scheme", "sourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "validation_rules_code_key" ON "validation_rules"("code");

-- CreateIndex
CREATE INDEX "budget_submissions_status_idx" ON "budget_submissions"("status");

-- CreateIndex
CREATE INDEX "budget_submissions_mdaId_idx" ON "budget_submissions"("mdaId");

-- CreateIndex
CREATE INDEX "budget_submissions_assignedReviewerId_idx" ON "budget_submissions"("assignedReviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_submissions_budgetYearId_mdaId_revisionNumber_key" ON "budget_submissions"("budgetYearId", "mdaId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "budget_versions_submissionId_versionNumber_key" ON "budget_versions"("submissionId", "versionNumber");

-- CreateIndex
CREATE INDEX "budget_lines_submissionId_kind_idx" ON "budget_lines"("submissionId", "kind");

-- CreateIndex
CREATE INDEX "budget_lines_budgetCodeId_idx" ON "budget_lines"("budgetCodeId");

-- CreateIndex
CREATE INDEX "budget_lines_capitalProjectId_idx" ON "budget_lines"("capitalProjectId");

-- CreateIndex
CREATE INDEX "personnel_budgets_submissionId_idx" ON "personnel_budgets"("submissionId");

-- CreateIndex
CREATE INDEX "capital_projects_mdaId_idx" ON "capital_projects"("mdaId");

-- CreateIndex
CREATE INDEX "capital_projects_status_idx" ON "capital_projects"("status");

-- CreateIndex
CREATE INDEX "procurement_plans_submissionId_idx" ON "procurement_plans"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_forecasts_submissionId_quarter_key" ON "cash_flow_forecasts"("submissionId", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "submission_notes_submissionId_form_key_key" ON "submission_notes"("submissionId", "form", "key");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_submissionId_key" ON "certifications"("submissionId");

-- CreateIndex
CREATE INDEX "validation_checks_submissionId_runAt_idx" ON "validation_checks"("submissionId", "runAt");

-- CreateIndex
CREATE INDEX "approval_steps_submissionId_createdAt_idx" ON "approval_steps"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "budget_reviews_submissionId_idx" ON "budget_reviews"("submissionId");

-- CreateIndex
CREATE INDEX "correction_items_submissionId_status_idx" ON "correction_items"("submissionId", "status");

-- CreateIndex
CREATE INDEX "comments_submissionId_createdAt_idx" ON "comments"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "attachments_submissionId_idx" ON "attachments"("submissionId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "budget_execution_budgetYearId_kind_idx" ON "budget_execution"("budgetYearId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "budget_execution_budgetYearId_mdaId_kind_lineKey_key" ON "budget_execution"("budgetYearId", "mdaId", "kind", "lineKey");

-- CreateIndex
CREATE INDEX "expenditure_execution_budgetYearId_month_idx" ON "expenditure_execution"("budgetYearId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "expenditure_execution_budgetYearId_mdaId_budgetCodeId_month_key" ON "expenditure_execution"("budgetYearId", "mdaId", "budgetCodeId", "month");

-- CreateIndex
CREATE INDEX "revenue_execution_budgetYearId_month_idx" ON "revenue_execution"("budgetYearId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_execution_budgetYearId_mdaId_budgetCodeId_month_key" ON "revenue_execution"("budgetYearId", "mdaId", "budgetCodeId", "month");

-- CreateIndex
CREATE INDEX "commitments_budgetYearId_mdaId_status_idx" ON "commitments"("budgetYearId", "mdaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commitments_budgetYearId_reference_key" ON "commitments"("budgetYearId", "reference");

-- CreateIndex
CREATE INDEX "imports_createdAt_idx" ON "imports"("createdAt");

-- CreateIndex
CREATE INDEX "import_rows_importId_status_idx" ON "import_rows"("importId", "status");

-- CreateIndex
CREATE INDEX "import_rows_importId_sheetName_rowNumber_idx" ON "import_rows"("importId", "sheetName", "rowNumber");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_mdaId_idx" ON "audit_logs"("mdaId");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mda_assignments" ADD CONSTRAINT "user_mda_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mda_assignments" ADD CONSTRAINT "user_mda_assignments_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdas" ADD CONSTRAINT "mdas_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdas" ADD CONSTRAINT "mdas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "mdas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdas" ADD CONSTRAINT "mdas_agencyTypeId_fkey" FOREIGN KEY ("agencyTypeId") REFERENCES "lookup_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdas" ADD CONSTRAINT "mdas_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "lookup_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdas" ADD CONSTRAINT "mdas_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "lookup_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_codes" ADD CONSTRAINT "budget_codes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "budget_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_codes" ADD CONSTRAINT "budget_codes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_mappings" ADD CONSTRAINT "code_mappings_targetCodeId_fkey" FOREIGN KEY ("targetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_parentSubmissionId_fkey" FOREIGN KEY ("parentSubmissionId") REFERENCES "budget_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_submissions" ADD CONSTRAINT "budget_submissions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "capital_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_budgets" ADD CONSTRAINT "personnel_budgets_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_budgets" ADD CONSTRAINT "personnel_budgets_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_projects" ADD CONSTRAINT "capital_projects_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_projects" ADD CONSTRAINT "capital_projects_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES "lookup_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_procurementMethodId_fkey" FOREIGN KEY ("procurementMethodId") REFERENCES "lookup_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_budgetCategoryId_fkey" FOREIGN KEY ("budgetCategoryId") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "capital_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_notes" ADD CONSTRAINT "submission_notes_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_checks" ADD CONSTRAINT "validation_checks_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "budget_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_reviews" ADD CONSTRAINT "budget_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_reviews" ADD CONSTRAINT "budget_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_items" ADD CONSTRAINT "correction_items_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "budget_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "budget_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_execution" ADD CONSTRAINT "budget_execution_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_execution" ADD CONSTRAINT "budget_execution_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_execution" ADD CONSTRAINT "budget_execution_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_execution" ADD CONSTRAINT "budget_execution_capitalProjectId_fkey" FOREIGN KEY ("capitalProjectId") REFERENCES "capital_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_execution" ADD CONSTRAINT "budget_execution_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "budget_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenditure_execution" ADD CONSTRAINT "expenditure_execution_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenditure_execution" ADD CONSTRAINT "expenditure_execution_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenditure_execution" ADD CONSTRAINT "expenditure_execution_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_execution" ADD CONSTRAINT "revenue_execution_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_execution" ADD CONSTRAINT "revenue_execution_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_execution" ADD CONSTRAINT "revenue_execution_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_mdaId_fkey" FOREIGN KEY ("mdaId") REFERENCES "mdas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "budget_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "budget_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

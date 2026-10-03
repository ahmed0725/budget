-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(255) NOT NULL,
    `jobTitle` VARCHAR(255) NULL,
    `phone` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `passwordChangedAt` DATETIME(3) NULL,
    `isDevSeed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameSo` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_mda_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `type` ENUM('BUDGET_OFFICER', 'FINANCE_OFFICER', 'ACCOUNTING_OFFICER', 'REVIEWER', 'VIEWER') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_mda_assignments_mdaId_idx`(`mdaId`),
    UNIQUE INDEX `user_mda_assignments_userId_mdaId_type_key`(`userId`, `mdaId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`),
    INDEX `sessions_userId_idx`(`userId`),
    INDEX `sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limits` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `resetAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sectors` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameEn` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sectors_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lookup_values` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('AGENCY_TYPE', 'REGION', 'MDA_CATEGORY', 'FUNDING_SOURCE', 'PROCUREMENT_METHOD') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameEn` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lookup_values_category_code_key`(`category`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mdas` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameEn` VARCHAR(255) NULL,
    `shortName` VARCHAR(191) NULL,
    `sectorId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `agencyTypeId` VARCHAR(191) NULL,
    `regionId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `accountingOfficer` VARCHAR(255) NULL,
    `financeDirector` VARCHAR(255) NULL,
    `budgetOfficer` VARCHAR(255) NULL,
    `contactPerson` VARCHAR(255) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDevSeed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `mdas_code_key`(`code`),
    INDEX `mdas_sectorId_idx`(`sectorId`),
    INDEX `mdas_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_years` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `preparationStart` DATE NULL,
    `preparationEnd` DATE NULL,
    `submissionDeadline` DATE NULL,
    `reviewStart` DATE NULL,
    `reviewEnd` DATE NULL,
    `approvalStart` DATE NULL,
    `approvalEnd` DATE NULL,
    `executionStart` DATE NULL,
    `executionEnd` DATE NULL,
    `closingDate` DATE NULL,
    `status` ENUM('DRAFT', 'PREPARATION', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `budget_years_year_key`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_categories` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameSo` VARCHAR(255) NOT NULL,
    `kind` ENUM('REVENUE', 'EXPENDITURE') NOT NULL,
    `summaryGroup` ENUM('PERSONNEL', 'GOODS_SERVICES', 'CAPITAL', 'OTHER') NULL,
    `isCapital` BOOLEAN NOT NULL DEFAULT false,
    `procurementEligible` BOOLEAN NOT NULL DEFAULT false,
    `defaultCodeId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `budget_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_codes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameEn` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `kind` ENUM('REVENUE', 'EXPENDITURE') NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `level` INTEGER NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `isPostable` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `effectiveFromYear` INTEGER NOT NULL,
    `effectiveToYear` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `budget_codes_kind_path_idx`(`kind`, `path`),
    INDEX `budget_codes_parentId_idx`(`parentId`),
    INDEX `budget_codes_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `budget_codes_kind_code_effectiveFromYear_key`(`kind`, `code`, `effectiveFromYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `code_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `scheme` VARCHAR(191) NOT NULL,
    `sourceCode` VARCHAR(191) NOT NULL,
    `sourceName` VARCHAR(255) NULL,
    `targetCodeId` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `code_mappings_scheme_sourceCode_key`(`scheme`, `sourceCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `description` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `validation_rules` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `nameSo` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` ENUM('ERROR', 'WARNING', 'INFO') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `tolerance` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `params` JSON NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NOT NULL,
    `field` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `validation_rules_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `budgetYearId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `type` ENUM('ORIGINAL', 'REVISION') NOT NULL DEFAULT 'ORIGINAL',
    `revisionType` ENUM('SUPPLEMENTARY', 'REALLOCATION', 'BUDGET_CUT', 'BUDGET_INCREASE', 'AGENCY_ADJUSTMENT') NULL,
    `revisionNumber` INTEGER NOT NULL DEFAULT 0,
    `parentSubmissionId` VARCHAR(191) NULL,
    `revisionReason` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'ENDORSED', 'RETURNED', 'APPROVED', 'REJECTED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'MANUAL',
    `allocationNumber` VARCHAR(191) NULL,
    `agencyCategory` VARCHAR(255) NULL,
    `accountingOfficer` VARCHAR(255) NULL,
    `contactPerson` VARCHAR(255) NULL,
    `telephone` VARCHAR(191) NULL,
    `email` VARCHAR(255) NULL,
    `assignedReviewerId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `supersededAt` DATETIME(3) NULL,
    `supersededById` VARCHAR(191) NULL,
    `totalRevenue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalExpenditure` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalRecurrent` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalPersonnel` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalCapital` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `completion` INTEGER NOT NULL DEFAULT 0,
    `validationErrors` INTEGER NOT NULL DEFAULT 0,
    `validationWarnings` INTEGER NOT NULL DEFAULT 0,
    `validationPassed` INTEGER NOT NULL DEFAULT 0,
    `lastValidatedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `budget_submissions_status_idx`(`status`),
    INDEX `budget_submissions_mdaId_idx`(`mdaId`),
    INDEX `budget_submissions_assignedReviewerId_idx`(`assignedReviewerId`),
    UNIQUE INDEX `budget_submissions_budgetYearId_mdaId_revisionNumber_key`(`budgetYearId`, `mdaId`, `revisionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_versions` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'ENDORSED', 'RETURNED', 'APPROVED', 'REJECTED', 'PUBLISHED') NOT NULL,
    `reason` TEXT NULL,
    `snapshot` JSON NOT NULL,
    `totals` JSON NOT NULL,
    `changes` JSON NULL,
    `isImmutable` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `budget_versions_submissionId_versionNumber_key`(`submissionId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_lines` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `budgetCodeId` VARCHAR(191) NOT NULL,
    `kind` ENUM('REVENUE', 'EXPENDITURE') NOT NULL,
    `capitalProjectId` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `priorYearActual` DECIMAL(18, 2) NULL,
    `currentYearEstimate` DECIMAL(18, 2) NULL,
    `justification` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'MANUAL',
    `sourceRef` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `budget_lines_submissionId_kind_idx`(`submissionId`, `kind`),
    INDEX `budget_lines_budgetCodeId_idx`(`budgetCodeId`),
    INDEX `budget_lines_capitalProjectId_idx`(`capitalProjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personnel_budgets` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `positionTitle` VARCHAR(255) NOT NULL,
    `grade` VARCHAR(191) NULL,
    `department` VARCHAR(255) NULL,
    `budgetCodeId` VARCHAR(191) NULL,
    `approvedEstablishment` INTEGER NOT NULL DEFAULT 0,
    `filledPositions` INTEGER NOT NULL DEFAULT 0,
    `monthlyCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `annualCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `personnel_budgets_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `capital_projects` (
    `id` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `projectCode` VARCHAR(191) NULL,
    `name` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `justification` TEXT NULL,
    `totalCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `spentToDate` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `fundingSourceId` VARCHAR(191) NULL,
    `fundingType` ENUM('GOVERNMENT', 'DONOR', 'MIXED') NOT NULL DEFAULT 'GOVERNMENT',
    `projectType` ENUM('NEW', 'ONGOING') NOT NULL DEFAULT 'NEW',
    `isMultiYear` BOOLEAN NOT NULL DEFAULT false,
    `startYear` INTEGER NULL,
    `expectedCompletionDate` DATE NULL,
    `status` ENUM('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'PROPOSED',
    `isDevSeed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `capital_projects_mdaId_idx`(`mdaId`),
    INDEX `capital_projects_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `procurement_plans` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `itemDescription` TEXT NOT NULL,
    `estimatedCost` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `procurementMethodId` VARCHAR(191) NULL,
    `quarter` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
    `responsibleDepartment` VARCHAR(255) NULL,
    `budgetCategoryId` VARCHAR(191) NULL,
    `capitalProjectId` VARCHAR(191) NULL,
    `remarks` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `procurement_plans_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_flow_forecasts` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `quarter` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cash_flow_forecasts_submissionId_quarter_key`(`submissionId`, `quarter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_notes` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `submission_notes_submissionId_form_key_key`(`submissionId`, `form`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certifications` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `preparedByName` VARCHAR(255) NULL,
    `preparedByTitle` VARCHAR(255) NULL,
    `preparedById` VARCHAR(191) NULL,
    `preparedAt` DATETIME(3) NULL,
    `preparedSignature` TEXT NULL,
    `reviewedByName` VARCHAR(255) NULL,
    `reviewedByTitle` VARCHAR(255) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedSignature` TEXT NULL,
    `approvedByName` VARCHAR(255) NULL,
    `approvedByTitle` VARCHAR(255) NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedSignature` TEXT NULL,
    `hrCertifiedByName` VARCHAR(255) NULL,
    `hrCertifiedById` VARCHAR(191) NULL,
    `hrCertifiedAt` DATETIME(3) NULL,
    `stampAttachmentId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `certifications_submissionId_key`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `validation_checks` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('PASS', 'WARNING', 'ERROR') NOT NULL,
    `severity` ENUM('ERROR', 'WARNING', 'INFO') NOT NULL,
    `calculated` DECIMAL(18, 2) NULL,
    `expected` DECIMAL(18, 2) NULL,
    `difference` DECIMAL(18, 2) NULL,
    `message` TEXT NOT NULL,
    `action` VARCHAR(255) NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NOT NULL,
    `field` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `runAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `validation_checks_submissionId_runAt_idx`(`submissionId`, `runAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_steps` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NULL,
    `stage` ENUM('PREPARATION', 'BUDGET_OFFICER_REVIEW', 'DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'PUBLICATION') NOT NULL,
    `action` ENUM('CREATE', 'SUBMIT', 'RESUBMIT', 'START_REVIEW', 'RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'RETURN', 'PUBLISH', 'REOPEN', 'ASSIGN', 'REVISION_CREATED', 'WITHDRAW') NOT NULL,
    `fromStatus` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'ENDORSED', 'RETURNED', 'APPROVED', 'REJECTED', 'PUBLISHED') NULL,
    `toStatus` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'ENDORSED', 'RETURNED', 'APPROVED', 'REJECTED', 'PUBLISHED') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(255) NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `approval_steps_submissionId_createdAt_idx`(`submissionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `stage` ENUM('PREPARATION', 'BUDGET_OFFICER_REVIEW', 'DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'PUBLICATION') NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `decision` ENUM('RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'RETURN') NULL,
    `summary` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `budget_reviews_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `correction_items` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NOT NULL,
    `section` VARCHAR(255) NULL,
    `field` VARCHAR(255) NULL,
    `comment` TEXT NOT NULL,
    `requiredCorrection` TEXT NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'ACCEPTED', 'REOPENED') NOT NULL DEFAULT 'OPEN',
    `resolutionNote` TEXT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `correction_items_submissionId_status_idx`(`submissionId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `comments_submissionId_createdAt_idx`(`submissionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `form` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VALIDATION', 'CERTIFICATION', 'GENERAL') NULL,
    `section` VARCHAR(255) NULL,
    `category` ENUM('BUDGET_JUSTIFICATION', 'PROJECT_PROPOSAL', 'PROCUREMENT_DOCUMENT', 'STAFFING_JUSTIFICATION', 'APPROVAL_LETTER', 'OFFICIAL_STAMP', 'SIGNED_CERTIFICATION', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `description` TEXT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `storagePath` VARCHAR(500) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `attachments_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `attachments_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('BUDGET_SUBMITTED', 'BUDGET_RETURNED', 'BUDGET_APPROVED', 'BUDGET_REJECTED', 'BUDGET_PUBLISHED', 'CORRECTION_REQUIRED', 'CORRECTION_RESOLVED', 'DEADLINE_APPROACHING', 'REVIEW_ASSIGNED', 'REVIEW_STAGE_ADVANCED', 'IMPORT_COMPLETED', 'VALIDATION_ERROR', 'COMMENT_ADDED', 'SYSTEM') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(500) NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_isRead_createdAt_idx`(`userId`, `isRead`, `createdAt`),
    UNIQUE INDEX `notifications_userId_dedupeKey_key`(`userId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_execution` (
    `id` VARCHAR(191) NOT NULL,
    `budgetYearId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `budgetCodeId` VARCHAR(191) NOT NULL,
    `kind` ENUM('REVENUE', 'EXPENDITURE') NOT NULL,
    `capitalProjectId` VARCHAR(191) NULL,
    `lineKey` VARCHAR(191) NOT NULL,
    `originalAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `revisedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `sourceSubmissionId` VARCHAR(191) NOT NULL,
    `revisionSubmissionId` VARCHAR(191) NULL,
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'SYSTEM',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `budget_execution_budgetYearId_kind_idx`(`budgetYearId`, `kind`),
    UNIQUE INDEX `budget_execution_budgetYearId_mdaId_kind_lineKey_key`(`budgetYearId`, `mdaId`, `kind`, `lineKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenditure_execution` (
    `id` VARCHAR(191) NOT NULL,
    `budgetYearId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `budgetCodeId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `plannedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `actualAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'MANUAL',
    `enteredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `expenditure_execution_budgetYearId_month_idx`(`budgetYearId`, `month`),
    UNIQUE INDEX `expenditure_execution_budgetYearId_mdaId_budgetCodeId_month_key`(`budgetYearId`, `mdaId`, `budgetCodeId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revenue_execution` (
    `id` VARCHAR(191) NOT NULL,
    `budgetYearId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `budgetCodeId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `targetAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `actualAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'MANUAL',
    `enteredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `revenue_execution_budgetYearId_month_idx`(`budgetYearId`, `month`),
    UNIQUE INDEX `revenue_execution_budgetYearId_mdaId_budgetCodeId_month_key`(`budgetYearId`, `mdaId`, `budgetCodeId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commitments` (
    `id` VARCHAR(191) NOT NULL,
    `budgetYearId` VARCHAR(191) NOT NULL,
    `mdaId` VARCHAR(191) NOT NULL,
    `budgetCodeId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `supplier` VARCHAR(255) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `commitmentDate` DATE NOT NULL,
    `status` ENUM('COMMITTED', 'OBLIGATED', 'LIQUIDATED', 'CANCELLED') NOT NULL DEFAULT 'COMMITTED',
    `obligatedAt` DATETIME(3) NULL,
    `liquidatedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` TEXT NULL,
    `source` ENUM('MANUAL', 'IMPORT', 'DEV_SEED', 'SYSTEM') NOT NULL DEFAULT 'MANUAL',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `commitments_budgetYearId_mdaId_status_idx`(`budgetYearId`, `mdaId`, `status`),
    UNIQUE INDEX `commitments_budgetYearId_reference_key`(`budgetYearId`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imports` (
    `id` VARCHAR(191) NOT NULL,
    `profile` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `storagePath` VARCHAR(500) NOT NULL,
    `status` ENUM('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'UPLOADED',
    `budgetYearId` VARCHAR(191) NULL,
    `mdaId` VARCHAR(191) NULL,
    `options` JSON NULL,
    `detected` JSON NULL,
    `summary` JSON NULL,
    `errorMessage` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validatedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `imports_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_rows` (
    `id` VARCHAR(191) NOT NULL,
    `importId` VARCHAR(191) NOT NULL,
    `sheetName` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `raw` JSON NOT NULL,
    `data` JSON NOT NULL,
    `status` ENUM('VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'SKIPPED', 'IMPORTED') NOT NULL,
    `issues` JSON NOT NULL,
    `resolution` VARCHAR(191) NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,

    INDEX `import_rows_importId_status_idx`(`importId`, `status`),
    INDEX `import_rows_importId_sheetName_rowNumber_idx`(`importId`, `sheetName`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_reports` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `isShared` BOOLEAN NOT NULL DEFAULT false,
    `config` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(255) NULL,
    `action` ENUM('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'SUBMIT', 'RETURN', 'RECOMMEND', 'ENDORSE', 'APPROVE', 'REJECT', 'PUBLISH', 'REOPEN', 'CERTIFY', 'IMPORT', 'EXPORT', 'PERMISSION_CHANGE', 'VALIDATE', 'ASSIGN') NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `mdaId` VARCHAR(191) NULL,
    `budgetYearId` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `reason` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    INDEX `audit_logs_mdaId_idx`(`mdaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_mda_assignments` ADD CONSTRAINT `user_mda_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_mda_assignments` ADD CONSTRAINT `user_mda_assignments_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mdas` ADD CONSTRAINT `mdas_sectorId_fkey` FOREIGN KEY (`sectorId`) REFERENCES `sectors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mdas` ADD CONSTRAINT `mdas_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `mdas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mdas` ADD CONSTRAINT `mdas_agencyTypeId_fkey` FOREIGN KEY (`agencyTypeId`) REFERENCES `lookup_values`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mdas` ADD CONSTRAINT `mdas_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `lookup_values`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mdas` ADD CONSTRAINT `mdas_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `lookup_values`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_codes` ADD CONSTRAINT `budget_codes_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `budget_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_codes` ADD CONSTRAINT `budget_codes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `budget_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `code_mappings` ADD CONSTRAINT `code_mappings_targetCodeId_fkey` FOREIGN KEY (`targetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_parentSubmissionId_fkey` FOREIGN KEY (`parentSubmissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_assignedReviewerId_fkey` FOREIGN KEY (`assignedReviewerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_submissions` ADD CONSTRAINT `budget_submissions_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_capitalProjectId_fkey` FOREIGN KEY (`capitalProjectId`) REFERENCES `capital_projects`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personnel_budgets` ADD CONSTRAINT `personnel_budgets_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnel_budgets` ADD CONSTRAINT `personnel_budgets_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `capital_projects` ADD CONSTRAINT `capital_projects_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `capital_projects` ADD CONSTRAINT `capital_projects_fundingSourceId_fkey` FOREIGN KEY (`fundingSourceId`) REFERENCES `lookup_values`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procurement_plans` ADD CONSTRAINT `procurement_plans_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procurement_plans` ADD CONSTRAINT `procurement_plans_procurementMethodId_fkey` FOREIGN KEY (`procurementMethodId`) REFERENCES `lookup_values`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procurement_plans` ADD CONSTRAINT `procurement_plans_budgetCategoryId_fkey` FOREIGN KEY (`budgetCategoryId`) REFERENCES `budget_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procurement_plans` ADD CONSTRAINT `procurement_plans_capitalProjectId_fkey` FOREIGN KEY (`capitalProjectId`) REFERENCES `capital_projects`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cash_flow_forecasts` ADD CONSTRAINT `cash_flow_forecasts_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_notes` ADD CONSTRAINT `submission_notes_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certifications` ADD CONSTRAINT `certifications_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `validation_checks` ADD CONSTRAINT `validation_checks_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `budget_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_reviews` ADD CONSTRAINT `budget_reviews_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_reviews` ADD CONSTRAINT `budget_reviews_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `correction_items` ADD CONSTRAINT `correction_items_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `correction_items` ADD CONSTRAINT `correction_items_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `budget_reviews`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_execution` ADD CONSTRAINT `budget_execution_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_execution` ADD CONSTRAINT `budget_execution_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_execution` ADD CONSTRAINT `budget_execution_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_execution` ADD CONSTRAINT `budget_execution_capitalProjectId_fkey` FOREIGN KEY (`capitalProjectId`) REFERENCES `capital_projects`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `budget_execution` ADD CONSTRAINT `budget_execution_sourceSubmissionId_fkey` FOREIGN KEY (`sourceSubmissionId`) REFERENCES `budget_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenditure_execution` ADD CONSTRAINT `expenditure_execution_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenditure_execution` ADD CONSTRAINT `expenditure_execution_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenditure_execution` ADD CONSTRAINT `expenditure_execution_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revenue_execution` ADD CONSTRAINT `revenue_execution_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revenue_execution` ADD CONSTRAINT `revenue_execution_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revenue_execution` ADD CONSTRAINT `revenue_execution_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_mdaId_fkey` FOREIGN KEY (`mdaId`) REFERENCES `mdas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_budgetCodeId_fkey` FOREIGN KEY (`budgetCodeId`) REFERENCES `budget_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imports` ADD CONSTRAINT `imports_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `imports` ADD CONSTRAINT `imports_budgetYearId_fkey` FOREIGN KEY (`budgetYearId`) REFERENCES `budget_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_rows` ADD CONSTRAINT `import_rows_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_reports` ADD CONSTRAINT `saved_reports_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


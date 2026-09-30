/**
 * Budget submission workflow (pure state machine).
 *
 *   Agency:            DRAFT ──submit──▶ SUBMITTED            (validation must pass)
 *   Budget officer:    SUBMITTED ──start review──▶ UNDER_REVIEW ──recommend──▶ RECOMMENDED
 *   Director:          RECOMMENDED ──endorse──▶ ENDORSED
 *   Approval authority ENDORSED ──approve──▶ APPROVED  (locked, immutable)
 *                      ENDORSED ──reject──▶ REJECTED
 *   Any review stage   ──return──▶ RETURNED ──resubmit──▶ SUBMITTED
 *   Administrator      APPROVED ──publish──▶ PUBLISHED ; REJECTED ──reopen──▶ DRAFT
 *   Agency             SUBMITTED ──withdraw──▶ DRAFT (only before review starts)
 */
import type { PermissionKey } from "@/lib/auth/permissions";

export type SubmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "RECOMMENDED"
  | "ENDORSED"
  | "RETURNED"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED";

export type WorkflowActionKey =
  | "SUBMIT"
  | "RESUBMIT"
  | "WITHDRAW"
  | "START_REVIEW"
  | "RECOMMEND"
  | "ENDORSE"
  | "APPROVE"
  | "REJECT"
  | "RETURN"
  | "PUBLISH"
  | "REOPEN";

export type WorkflowStageKey = "PREPARATION" | "BUDGET_OFFICER_REVIEW" | "DIRECTOR_REVIEW" | "FINAL_APPROVAL" | "PUBLICATION";

export interface TransitionRule {
  action: WorkflowActionKey;
  from: SubmissionStatus;
  to: SubmissionStatus;
  permission: PermissionKey;
  stage: WorkflowStageKey;
  /** A comment is mandatory (e.g. reasons for returning or rejecting). */
  requiresComment: boolean;
  /** Validation errors block the action. */
  requiresValidation: boolean;
  /** The actor must belong to the submission's MDA (agency-side actions). */
  agencyAction: boolean;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { action: "SUBMIT", from: "DRAFT", to: "SUBMITTED", permission: "budget.submit", stage: "PREPARATION", requiresComment: false, requiresValidation: true, agencyAction: true },
  { action: "RESUBMIT", from: "RETURNED", to: "SUBMITTED", permission: "budget.submit", stage: "PREPARATION", requiresComment: false, requiresValidation: true, agencyAction: true },
  { action: "WITHDRAW", from: "SUBMITTED", to: "DRAFT", permission: "budget.submit", stage: "PREPARATION", requiresComment: true, requiresValidation: false, agencyAction: true },

  { action: "START_REVIEW", from: "SUBMITTED", to: "UNDER_REVIEW", permission: "review.stage1", stage: "BUDGET_OFFICER_REVIEW", requiresComment: false, requiresValidation: false, agencyAction: false },
  { action: "RECOMMEND", from: "UNDER_REVIEW", to: "RECOMMENDED", permission: "review.stage1", stage: "BUDGET_OFFICER_REVIEW", requiresComment: false, requiresValidation: true, agencyAction: false },
  { action: "RETURN", from: "SUBMITTED", to: "RETURNED", permission: "review.stage1", stage: "BUDGET_OFFICER_REVIEW", requiresComment: true, requiresValidation: false, agencyAction: false },
  { action: "RETURN", from: "UNDER_REVIEW", to: "RETURNED", permission: "review.stage1", stage: "BUDGET_OFFICER_REVIEW", requiresComment: true, requiresValidation: false, agencyAction: false },

  { action: "ENDORSE", from: "RECOMMENDED", to: "ENDORSED", permission: "review.stage2", stage: "DIRECTOR_REVIEW", requiresComment: false, requiresValidation: true, agencyAction: false },
  { action: "RETURN", from: "RECOMMENDED", to: "RETURNED", permission: "review.stage2", stage: "DIRECTOR_REVIEW", requiresComment: true, requiresValidation: false, agencyAction: false },

  { action: "APPROVE", from: "ENDORSED", to: "APPROVED", permission: "review.final", stage: "FINAL_APPROVAL", requiresComment: false, requiresValidation: true, agencyAction: false },
  { action: "REJECT", from: "ENDORSED", to: "REJECTED", permission: "review.final", stage: "FINAL_APPROVAL", requiresComment: true, requiresValidation: false, agencyAction: false },
  { action: "RETURN", from: "ENDORSED", to: "RETURNED", permission: "review.final", stage: "FINAL_APPROVAL", requiresComment: true, requiresValidation: false, agencyAction: false },

  { action: "PUBLISH", from: "APPROVED", to: "PUBLISHED", permission: "budget.publish", stage: "PUBLICATION", requiresComment: false, requiresValidation: false, agencyAction: false },
  { action: "REOPEN", from: "REJECTED", to: "DRAFT", permission: "budget.reopen", stage: "PREPARATION", requiresComment: true, requiresValidation: false, agencyAction: false },
];

/** Statuses in which the agency may edit the forms. */
export const EDITABLE_STATUSES: readonly SubmissionStatus[] = ["DRAFT", "RETURNED"];
/** Statuses after which the budget is locked and immutable. */
export const LOCKED_STATUSES: readonly SubmissionStatus[] = ["APPROVED", "PUBLISHED"];
/** Statuses that count as "in review" (pending a Ministry decision). */
export const IN_REVIEW_STATUSES: readonly SubmissionStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED"];
export const APPROVED_STATUSES: readonly SubmissionStatus[] = ["APPROVED", "PUBLISHED"];

export function isEditableStatus(status: SubmissionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function findTransition(status: SubmissionStatus, action: WorkflowActionKey): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === status && t.action === action);
}

export interface ActorCapabilities {
  permissions: ReadonlySet<string>;
  /** Whether the actor is assigned to (or has scope over) the submission's MDA. */
  hasMdaAccess: boolean;
  /** Whether the actor is an agency-side user of this MDA (assignment, not global scope). */
  isAgencyMember: boolean;
}

export type TransitionCheck =
  | { allowed: true; rule: TransitionRule }
  | { allowed: false; reason: "INVALID_TRANSITION" | "FORBIDDEN" | "NO_MDA_ACCESS" | "COMMENT_REQUIRED" | "VALIDATION_FAILED"; message: string };

/**
 * Decide whether an actor may perform `action` on a submission in `status`.
 * `validationErrors` is the number of blocking validation errors.
 */
export function checkTransition(
  status: SubmissionStatus,
  action: WorkflowActionKey,
  actor: ActorCapabilities,
  input: { comment?: string | null; validationErrors?: number } = {},
): TransitionCheck {
  const rule = findTransition(status, action);
  if (!rule) {
    return { allowed: false, reason: "INVALID_TRANSITION", message: `Cannot ${action.toLowerCase().replace("_", " ")} a budget that is ${status.toLowerCase().replace("_", " ")}.` };
  }
  if (!actor.permissions.has(rule.permission)) {
    return { allowed: false, reason: "FORBIDDEN", message: `You do not have permission to ${action.toLowerCase().replace("_", " ")} this budget.` };
  }
  if (!actor.hasMdaAccess || (rule.agencyAction && !actor.isAgencyMember)) {
    return { allowed: false, reason: "NO_MDA_ACCESS", message: "You are not assigned to this MDA." };
  }
  if (rule.requiresComment && !input.comment?.trim()) {
    return { allowed: false, reason: "COMMENT_REQUIRED", message: "A comment explaining this decision is required." };
  }
  if (rule.requiresValidation && (input.validationErrors ?? 0) > 0) {
    return {
      allowed: false,
      reason: "VALIDATION_FAILED",
      message: `${input.validationErrors} validation error(s) must be resolved first.`,
    };
  }
  return { allowed: true, rule };
}

/** Actions currently available to an actor (ignores comment/validation preconditions). */
export function availableActions(status: SubmissionStatus, actor: ActorCapabilities): TransitionRule[] {
  return TRANSITIONS.filter(
    (t) => t.from === status && actor.permissions.has(t.permission) && actor.hasMdaAccess && (!t.agencyAction || actor.isAgencyMember),
  );
}

/** Stage currently responsible for a submission in `status`. */
export function stageOfStatus(status: SubmissionStatus): WorkflowStageKey {
  switch (status) {
    case "DRAFT":
    case "RETURNED":
      return "PREPARATION";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "BUDGET_OFFICER_REVIEW";
    case "RECOMMENDED":
      return "DIRECTOR_REVIEW";
    case "ENDORSED":
      return "FINAL_APPROVAL";
    default:
      return "PUBLICATION";
  }
}

/** Ordered stages for the approval timeline display. */
export const STAGE_ORDER: readonly WorkflowStageKey[] = ["PREPARATION", "BUDGET_OFFICER_REVIEW", "DIRECTOR_REVIEW", "FINAL_APPROVAL", "PUBLICATION"];

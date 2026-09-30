import { describe, expect, it } from "vitest";
import { availableActions, checkTransition, isEditableStatus, stageOfStatus, type ActorCapabilities } from "@/lib/workflow/machine";

const actor = (permissions: string[], opts: Partial<ActorCapabilities> = {}): ActorCapabilities => ({
  permissions: new Set(permissions),
  hasMdaAccess: true,
  isAgencyMember: false,
  ...opts,
});

describe("workflow state machine", () => {
  const agency = actor(["budget.submit", "budget.prepare"], { isAgencyMember: true });
  const reviewer = actor(["review.stage1"]);
  const director = actor(["review.stage2"]);
  const authority = actor(["review.final", "budget.publish"]);

  it("lets the agency submit only when validation passes", () => {
    expect(checkTransition("DRAFT", "SUBMIT", agency, { validationErrors: 3 })).toMatchObject({ allowed: false, reason: "VALIDATION_FAILED" });
    expect(checkTransition("DRAFT", "SUBMIT", agency, { validationErrors: 0 })).toMatchObject({ allowed: true });
  });

  it("requires agency membership for agency actions", () => {
    const outsider = actor(["budget.submit"], { isAgencyMember: false });
    expect(checkTransition("DRAFT", "SUBMIT", outsider)).toMatchObject({ allowed: false, reason: "NO_MDA_ACCESS" });
  });

  it("runs the full review chain", () => {
    expect(checkTransition("SUBMITTED", "START_REVIEW", reviewer)).toMatchObject({ allowed: true, rule: { to: "UNDER_REVIEW" } });
    expect(checkTransition("UNDER_REVIEW", "RECOMMEND", reviewer)).toMatchObject({ allowed: true, rule: { to: "RECOMMENDED" } });
    expect(checkTransition("RECOMMENDED", "ENDORSE", director)).toMatchObject({ allowed: true, rule: { to: "ENDORSED" } });
    expect(checkTransition("ENDORSED", "APPROVE", authority)).toMatchObject({ allowed: true, rule: { to: "APPROVED" } });
    expect(checkTransition("APPROVED", "PUBLISH", authority)).toMatchObject({ allowed: true, rule: { to: "PUBLISHED" } });
  });

  it("prevents skipping stages and acting without permission", () => {
    expect(checkTransition("SUBMITTED", "APPROVE", authority)).toMatchObject({ allowed: false, reason: "INVALID_TRANSITION" });
    expect(checkTransition("RECOMMENDED", "ENDORSE", reviewer)).toMatchObject({ allowed: false, reason: "FORBIDDEN" });
  });

  it("requires a comment to return or reject", () => {
    expect(checkTransition("UNDER_REVIEW", "RETURN", reviewer, { comment: " " })).toMatchObject({ allowed: false, reason: "COMMENT_REQUIRED" });
    expect(checkTransition("UNDER_REVIEW", "RETURN", reviewer, { comment: "Fix Form E" })).toMatchObject({ allowed: true, rule: { to: "RETURNED" } });
    expect(checkTransition("ENDORSED", "REJECT", authority, { comment: "Not affordable" })).toMatchObject({ allowed: true, rule: { to: "REJECTED" } });
  });

  it("allows the agency to resubmit a returned budget", () => {
    expect(isEditableStatus("RETURNED")).toBe(true);
    expect(checkTransition("RETURNED", "RESUBMIT", agency, { validationErrors: 0 })).toMatchObject({ allowed: true, rule: { to: "SUBMITTED" } });
  });

  it("locks approved budgets against further transitions except publication", () => {
    expect(isEditableStatus("APPROVED")).toBe(false);
    expect(availableActions("APPROVED", agency)).toHaveLength(0);
    expect(availableActions("APPROVED", authority).map((a) => a.action)).toEqual(["PUBLISH"]);
  });

  it("maps statuses to stages", () => {
    expect(stageOfStatus("UNDER_REVIEW")).toBe("BUDGET_OFFICER_REVIEW");
    expect(stageOfStatus("ENDORSED")).toBe("FINAL_APPROVAL");
  });
});

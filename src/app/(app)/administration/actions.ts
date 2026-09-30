"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import * as admin from "@/lib/services/admin";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/services/settings";
import { categorySchema, codeSchema, lookupSchema, mdaSchema, roleSchema, ruleSchema, userSchema, yearSchema } from "@/lib/validations/admin";

const id = z.string().min(1).max(64);

export async function saveMdaAction(mdaId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.mda.manage");
    const data = parseInput(mdaSchema, input);
    const mda = mdaId ? await admin.updateMda(actor, parseInput(id, mdaId), data) : await admin.createMda(actor, data);
    revalidatePath("/administration/mdas", "layout");
    return { id: mda.id };
  });
}

export async function setMdaActiveAction(mdaId: string, isActive: boolean, reason: string) {
  return runAction(async () => {
    const actor = await actorForAction("admin.mda.manage");
    await admin.setMdaActive(actor, parseInput(id, mdaId), isActive, z.string().max(500).parse(reason));
    revalidatePath("/administration/mdas", "layout");
    return null;
  });
}

export async function setMdaAssignmentsAction(mdaId: string, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.mda.manage", "admin.users.manage");
    const data = parseInput(z.array(z.object({ userId: id, type: z.enum(["BUDGET_OFFICER", "FINANCE_OFFICER", "ACCOUNTING_OFFICER", "REVIEWER", "VIEWER"]) })).max(200), input);
    await admin.setMdaAssignments(actor, parseInput(id, mdaId), data);
    revalidatePath(`/administration/mdas/${mdaId}`);
    return null;
  });
}

export async function saveCodeAction(codeId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.codes.manage");
    const data = parseInput(codeSchema, input);
    const code = codeId ? await admin.updateCode(actor, parseInput(id, codeId), data) : await admin.createCode(actor, data);
    revalidatePath("/administration/budget-codes");
    return { id: code.id };
  });
}

export async function saveCodeMappingAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.codes.manage");
    const data = parseInput(z.object({ scheme: z.string().min(1).max(60), sourceCode: z.string().min(1).max(20), sourceName: z.string().max(200).nullable(), targetCodeId: id, notes: z.string().max(500).nullable() }), input);
    await admin.saveCodeMapping(actor, data);
    revalidatePath("/administration/budget-codes");
    return null;
  });
}

export async function saveYearAction(yearId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.years.manage");
    const data = parseInput(yearSchema, input);
    const y = yearId ? await admin.updateYear(actor, parseInput(id, yearId), data) : await admin.createYear(actor, data);
    revalidatePath("/administration/budget-years");
    revalidatePath("/budget/years");
    return { id: y.id };
  });
}

export async function changeYearStatusAction(yearId: string, status: string, reason: string | null) {
  return runAction(async () => {
    const actor = await actorForAction("admin.years.manage", "budget.publish");
    const res = await admin.changeYearStatus(actor, parseInput(id, yearId), z.enum(["DRAFT", "PREPARATION", "REVIEW", "APPROVED", "PUBLISHED", "ACTIVE", "CLOSED"]).parse(status), reason);
    revalidatePath("/administration/budget-years");
    revalidatePath("/budget/years");
    return res;
  });
}

export async function saveUserAction(userId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.users.manage");
    const data = parseInput(userSchema, input);
    if (userId) {
      await admin.updateUser(actor, parseInput(id, userId), data);
      revalidatePath("/administration/users", "layout");
      return { id: userId, temporaryPassword: null as string | null };
    }
    const res = await admin.createUser(actor, data);
    revalidatePath("/administration/users");
    return { id: res.user.id, temporaryPassword: res.temporaryPassword as string | null };
  });
}

export async function resetPasswordAction(userId: string) {
  return runAction(async () => {
    const actor = await actorForAction("admin.users.manage");
    const password = await admin.resetUserPassword(actor, parseInput(id, userId));
    return { temporaryPassword: password };
  });
}

export async function unlockUserAction(userId: string) {
  return runAction(async () => {
    const actor = await actorForAction("admin.users.manage");
    await admin.unlockUser(actor, parseInput(id, userId));
    revalidatePath("/administration/users", "layout");
    return null;
  });
}

export async function saveRoleAction(roleId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.roles.manage");
    const role = await admin.saveRole(actor, roleId ? parseInput(id, roleId) : null, parseInput(roleSchema, input));
    revalidatePath("/administration/roles");
    return { id: role.id };
  });
}

export async function deleteRoleAction(roleId: string) {
  return runAction(async () => {
    const actor = await actorForAction("admin.roles.manage");
    await admin.deleteRole(actor, parseInput(id, roleId));
    revalidatePath("/administration/roles");
    return null;
  });
}

const intRange = (min: number, max: number) => z.coerce.number({ message: "Enter a number" }).int("Enter a whole number").min(min, `Enter a value between ${min} and ${max}`).max(max, `Enter a value between ${min} and ${max}`);
const numRange = (min: number, max: number) => z.coerce.number({ message: "Enter a number" }).min(min, `Enter a value between ${min} and ${max}`).max(max, `Enter a value between ${min} and ${max}`);

const settingSchemas: { [K in keyof AppSettings]: z.ZodType<AppSettings[K]> } = {
  organization: z.object({
    governmentName: z.string().min(2).max(200),
    governmentNameEn: z.string().min(2).max(200),
    ministryName: z.string().min(2).max(200),
    ministryNameEn: z.string().min(2).max(200),
    departmentName: z.string().min(2).max(200),
    departmentNameEn: z.string().min(2).max(200),
  }),
  currency: z.object({ code: z.string().regex(/^[A-Z]{3}$/, "Use the three-letter ISO code, e.g. USD"), symbol: z.string().min(1).max(5), decimals: intRange(0, 3), name: z.string().min(2).max(60) }),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  defaultLocale: z.enum(["en", "so"]),
  security: z.object({
    sessionHours: intRange(1, 24),
    idleTimeoutMinutes: intRange(5, 480),
    maxFailedLogins: intRange(3, 20),
    lockoutMinutes: intRange(1, 1440),
    passwordMinLength: intRange(8, 64),
  }),
  budget: z.object({
    requireFullCertification: z.boolean(),
    deadlineReminderDays: intRange(1, 60),
    largeVariancePercent: numRange(1, 100),
    revenueAlertPercent: numRange(1, 100),
  }),
  attachments: z.object({ maxSizeMb: intRange(1, 100), allowedExtensions: z.array(z.enum(["pdf", "docx", "doc", "xlsx", "xls", "csv", "png", "jpg", "jpeg"])).min(1) }),
};

export async function saveSettingAction(key: string, value: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.settings.manage");
    if (!(key in DEFAULT_SETTINGS)) throw new Error("Unknown setting");
    const k = key as keyof AppSettings;
    const data = parseInput(settingSchemas[k] as z.ZodType<AppSettings[typeof k]>, value);
    await admin.saveSetting(actor, k, data);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function saveLookupAction(lookupId: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.settings.manage");
    await admin.saveLookup(actor, lookupId, parseInput(lookupSchema, input));
    revalidatePath("/administration/settings");
    return null;
  });
}

export async function saveRuleAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.validation.manage");
    await admin.saveRule(actor, parseInput(ruleSchema, input));
    revalidatePath("/administration/settings");
    return null;
  });
}

export async function saveCategoryAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("admin.codes.manage");
    await admin.saveCategory(actor, parseInput(categorySchema, input));
    revalidatePath("/administration/settings");
    return null;
  });
}

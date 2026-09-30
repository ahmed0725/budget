/**
 * Administration services: MDAs, classification codes, budget years, users, roles,
 * lookups, validation rules, categories and system settings. Every change is
 * authorised server-side and written to the audit log.
 */
import crypto from "node:crypto";
import type { BudgetYearStatus, Prisma } from "@/generated/prisma/client";
import { can, type Actor } from "@/lib/auth/actor";
import { hashPassword } from "@/lib/auth/password";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationFailedError } from "@/lib/errors";
import type { CodeInput, MdaInput, RoleInput, UserInput, YearInput } from "@/lib/validations/admin";
import { audit, changedFields } from "./audit";
import { publishAllocations } from "./execution-baseline";
import { invalidateReferenceCache } from "./reference";
import { DEFAULT_SETTINGS, invalidateSettingsCache, type AppSettings } from "./settings";

function need(actor: Actor, permission: PermissionKey) {
  if (!can(actor, permission)) throw new AuthorizationError();
}

const d = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

// ─────────────────────────────────────────────────────────────────────────────
// MDAs
// ─────────────────────────────────────────────────────────────────────────────

export async function listMdas(filters: { q?: string; sectorId?: string; active?: "active" | "inactive"; page: number; pageSize: number; sort?: string | null }) {
  const where: Prisma.MdaWhereInput = {
    deletedAt: null,
    ...(filters.sectorId ? { sectorId: filters.sectorId } : {}),
    ...(filters.active === "active" ? { isActive: true } : filters.active === "inactive" ? { isActive: false } : {}),
    ...(filters.q ? { OR: [{ code: { contains: filters.q } }, { name: { contains: filters.q, mode: "insensitive" } }, { nameEn: { contains: filters.q, mode: "insensitive" } }] } : {}),
  };
  const [key, dir] = (filters.sort ?? "code.asc").split(".");
  const orderBy: Prisma.MdaOrderByWithRelationInput = key === "name" ? { name: dir === "desc" ? "desc" : "asc" } : key === "sector" ? { sector: { code: dir === "desc" ? "desc" : "asc" } } : { code: dir === "desc" ? "desc" : "asc" };
  const [total, rows] = await Promise.all([
    prisma.mda.count({ where }),
    prisma.mda.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: { sector: true, agencyType: true, region: true, _count: { select: { assignments: true, submissions: true } } },
    }),
  ]);
  return { total, rows };
}

async function assertUniqueMdaCode(code: string, exceptId?: string) {
  const existing = await prisma.mda.findUnique({ where: { code } });
  if (existing && existing.id !== exceptId) throw new ValidationFailedError(`MDA code ${code} is already used by ${existing.name}.`, { code: ["This code is already in use"] });
}

export async function createMda(actor: Actor, input: MdaInput) {
  need(actor, "admin.mda.manage");
  await assertUniqueMdaCode(input.code);
  return prisma.$transaction(async (tx) => {
    const mda = await tx.mda.create({ data: { ...input, parentId: input.parentId ?? null } });
    await audit(tx, actor, { action: "CREATE", entityType: "Mda", entityId: mda.id, mdaId: mda.id, summary: `Created MDA ${mda.code} — ${mda.name}`, newValue: input });
    return mda;
  });
}

export async function updateMda(actor: Actor, id: string, input: MdaInput) {
  need(actor, "admin.mda.manage");
  const current = await prisma.mda.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new NotFoundError("MDA");
  if (input.code !== current.code) {
    const used = await prisma.budgetSubmission.count({ where: { mdaId: id, isLocked: true } });
    if (used) throw new BusinessRuleError("The code of an MDA with approved budgets cannot be changed; it is referenced by official records.");
    await assertUniqueMdaCode(input.code, id);
  }
  if (input.parentId === id) throw new ValidationFailedError("An MDA cannot be its own parent.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.mda.update({ where: { id }, data: { ...input, parentId: input.parentId ?? null } });
    const diff = changedFields(current as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    if (diff) await audit(tx, actor, { action: "UPDATE", entityType: "Mda", entityId: id, mdaId: id, summary: `Updated MDA ${updated.code}`, ...diff });
    return updated;
  });
}

export async function setMdaActive(actor: Actor, id: string, isActive: boolean, reason: string) {
  need(actor, "admin.mda.manage");
  const mda = await prisma.mda.findUnique({ where: { id } });
  if (!mda) throw new NotFoundError("MDA");
  if (!isActive) {
    const open = await prisma.budgetSubmission.count({ where: { mdaId: id, status: { in: ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED"] } } });
    if (open) throw new BusinessRuleError("This MDA has budgets under review. Complete or return them before deactivating the MDA.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.mda.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, { action: "UPDATE", entityType: "Mda", entityId: id, mdaId: id, summary: `${isActive ? "Activated" : "Deactivated"} MDA ${mda.code}`, oldValue: { isActive: mda.isActive }, newValue: { isActive }, reason });
  });
}

export async function setMdaAssignments(actor: Actor, mdaId: string, assignments: { userId: string; type: "BUDGET_OFFICER" | "FINANCE_OFFICER" | "ACCOUNTING_OFFICER" | "REVIEWER" | "VIEWER" }[]) {
  if (!can(actor, "admin.mda.manage") && !can(actor, "admin.users.manage")) throw new AuthorizationError();
  const before = await prisma.userMdaAssignment.findMany({ where: { mdaId } });
  await prisma.$transaction(async (tx) => {
    await tx.userMdaAssignment.deleteMany({ where: { mdaId } });
    if (assignments.length) await tx.userMdaAssignment.createMany({ data: assignments.map((a) => ({ ...a, mdaId })), skipDuplicates: true });
    await audit(tx, actor, { action: "ASSIGN", entityType: "Mda", entityId: mdaId, mdaId, summary: "MDA user assignments updated", oldValue: before.map((b) => ({ userId: b.userId, type: b.type })), newValue: assignments });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification codes
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeNode {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  level: number;
  categoryId: string | null;
  isPostable: boolean;
  isActive: boolean;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  usage: number;
  children: CodeNode[];
}

export async function codeTree(kind: "REVENUE" | "EXPENDITURE", opts: { q?: string } = {}): Promise<CodeNode[]> {
  const codes = await prisma.budgetCode.findMany({ where: { kind }, orderBy: { path: "asc" }, include: { _count: { select: { lines: true } } } });
  const nodes = new Map<string, CodeNode>();
  for (const c of codes) {
    nodes.set(c.id, { id: c.id, code: c.code, name: c.name, nameEn: c.nameEn, level: c.level, categoryId: c.categoryId, isPostable: c.isPostable, isActive: c.isActive, effectiveFromYear: c.effectiveFromYear, effectiveToYear: c.effectiveToYear, usage: c._count.lines, children: [] });
  }
  const roots: CodeNode[] = [];
  for (const c of codes) {
    const node = nodes.get(c.id)!;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  if (!opts.q) return roots;
  const q = opts.q.toLowerCase();
  const prune = (list: CodeNode[]): CodeNode[] =>
    list
      .map((n) => ({ ...n, children: prune(n.children) }))
      .filter((n) => n.children.length > 0 || n.code.startsWith(q) || n.name.toLowerCase().includes(q) || (n.nameEn ?? "").toLowerCase().includes(q));
  return prune(roots);
}

async function computePath(parentId: string | null | undefined, code: string) {
  if (!parentId) return { path: code, level: 1, parent: null };
  const parent = await prisma.budgetCode.findUnique({ where: { id: parentId } });
  if (!parent) throw new ValidationFailedError("The parent code does not exist.", { parentId: ["Unknown parent"] });
  return { path: `${parent.path}/${code}`, level: parent.level + 1, parent };
}

async function assertNoOverlap(kind: "REVENUE" | "EXPENDITURE", code: string, from: number, to: number | null, exceptId?: string) {
  const same = await prisma.budgetCode.findMany({ where: { kind, code, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  const overlap = same.find((c) => c.effectiveFromYear <= (to ?? 9999) && (c.effectiveToYear ?? 9999) >= from);
  if (overlap) {
    throw new ValidationFailedError(`Code ${code} already exists for ${overlap.effectiveFromYear}${overlap.effectiveToYear ? `–${overlap.effectiveToYear}` : " onwards"}. End its effective period first or choose a different code.`, { code: ["Overlapping effective period"] });
  }
}

export async function createCode(actor: Actor, input: CodeInput) {
  need(actor, "admin.codes.manage");
  if (input.effectiveToYear !== null && input.effectiveToYear < input.effectiveFromYear) throw new ValidationFailedError("The effective end year is before the start year.");
  await assertNoOverlap(input.kind, input.code, input.effectiveFromYear, input.effectiveToYear);
  const { path, level, parent } = await computePath(input.parentId, input.code);
  if (parent && parent.kind !== input.kind) throw new ValidationFailedError("The parent must be a code of the same kind.");
  if (parent && !input.code.startsWith(parent.code)) throw new ValidationFailedError(`Child codes must start with the parent code ${parent.code}.`, { code: [`Must start with ${parent.code}`] });
  return prisma.$transaction(async (tx) => {
    const created = await tx.budgetCode.create({
      data: {
        kind: input.kind,
        code: input.code,
        name: input.name,
        nameEn: input.nameEn ?? null,
        description: input.description ?? null,
        parentId: parent?.id ?? null,
        path,
        level,
        categoryId: input.categoryId ?? parent?.categoryId ?? null,
        isPostable: input.isPostable,
        isActive: input.isActive,
        effectiveFromYear: input.effectiveFromYear,
        effectiveToYear: input.effectiveToYear,
        sortOrder: input.sortOrder,
      },
    });
    if (parent?.isPostable) await tx.budgetCode.update({ where: { id: parent.id }, data: { isPostable: false } });
    await audit(tx, actor, { action: "CREATE", entityType: "BudgetCode", entityId: created.id, summary: `Created ${input.kind.toLowerCase()} code ${input.code} ${input.name}`, newValue: input });
    return created;
  });
}

export async function updateCode(actor: Actor, id: string, input: CodeInput) {
  need(actor, "admin.codes.manage");
  const current = await prisma.budgetCode.findUnique({ where: { id }, include: { _count: { select: { lines: true, children: true } } } });
  if (!current) throw new NotFoundError("code");
  if (input.code !== current.code || input.kind !== current.kind || (input.parentId ?? null) !== current.parentId) {
    if (current._count.lines > 0 || current._count.children > 0) {
      throw new BusinessRuleError(`Code ${current.code} is used by ${current._count.lines} budget line(s) and ${current._count.children} child code(s); its number, kind and parent cannot change. Create a new code and end this one's effective period instead.`);
    }
  }
  if (input.effectiveToYear !== null && input.effectiveToYear < input.effectiveFromYear) throw new ValidationFailedError("The effective end year is before the start year.");
  await assertNoOverlap(input.kind, input.code, input.effectiveFromYear, input.effectiveToYear, id);
  const { path, level, parent } = await computePath(input.parentId, input.code);
  return prisma.$transaction(async (tx) => {
    const data = {
      kind: input.kind,
      code: input.code,
      name: input.name,
      nameEn: input.nameEn ?? null,
      description: input.description ?? null,
      parentId: parent?.id ?? null,
      path,
      level,
      categoryId: input.categoryId ?? null,
      isPostable: current._count.children > 0 ? false : input.isPostable,
      isActive: input.isActive,
      effectiveFromYear: input.effectiveFromYear,
      effectiveToYear: input.effectiveToYear,
      sortOrder: input.sortOrder,
    };
    const updated = await tx.budgetCode.update({ where: { id }, data });
    // Propagate a category change to descendants that inherited the old category.
    if (current.categoryId !== data.categoryId) {
      await tx.budgetCode.updateMany({ where: { path: { startsWith: `${current.path}/` }, categoryId: current.categoryId }, data: { categoryId: data.categoryId } });
    }
    const diff = changedFields(current as unknown as Record<string, unknown>, data);
    if (diff) await audit(tx, actor, { action: "UPDATE", entityType: "BudgetCode", entityId: id, summary: `Updated code ${updated.code}`, ...diff });
    invalidateReferenceCache();
    return updated;
  });
}

export async function saveCodeMapping(actor: Actor, input: { scheme: string; sourceCode: string; sourceName: string | null; targetCodeId: string; notes: string | null }) {
  need(actor, "admin.codes.manage");
  const target = await prisma.budgetCode.findUnique({ where: { id: input.targetCodeId } });
  if (!target) throw new NotFoundError("target code");
  return prisma.$transaction(async (tx) => {
    const row = await tx.codeMapping.upsert({
      where: { scheme_sourceCode: { scheme: input.scheme, sourceCode: input.sourceCode } },
      create: input,
      update: { sourceName: input.sourceName, targetCodeId: input.targetCodeId, notes: input.notes },
    });
    await audit(tx, actor, { action: "UPDATE", entityType: "CodeMapping", entityId: row.id, summary: `Mapping ${input.scheme}:${input.sourceCode} → ${target.code}`, newValue: input });
    return row;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget years
// ─────────────────────────────────────────────────────────────────────────────

const YEAR_FLOW: Record<BudgetYearStatus, BudgetYearStatus[]> = {
  DRAFT: ["PREPARATION"],
  PREPARATION: ["REVIEW", "DRAFT"],
  REVIEW: ["APPROVED", "PREPARATION"],
  APPROVED: ["PUBLISHED", "REVIEW"],
  PUBLISHED: ["ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
};

export function allowedYearTransitions(status: BudgetYearStatus) {
  return YEAR_FLOW[status];
}

function yearData(input: YearInput) {
  return {
    year: input.year,
    name: input.name,
    startDate: d(input.startDate)!,
    endDate: d(input.endDate)!,
    preparationStart: d(input.preparationStart),
    preparationEnd: d(input.preparationEnd),
    submissionDeadline: d(input.submissionDeadline),
    reviewStart: d(input.reviewStart),
    reviewEnd: d(input.reviewEnd),
    approvalStart: d(input.approvalStart),
    approvalEnd: d(input.approvalEnd),
    executionStart: d(input.executionStart),
    executionEnd: d(input.executionEnd),
    closingDate: d(input.closingDate),
    notes: input.notes ?? null,
  };
}

function checkYearDates(input: YearInput) {
  const problems: string[] = [];
  if (input.endDate < input.startDate) problems.push("The fiscal year end is before its start.");
  if (input.preparationStart && input.submissionDeadline && input.submissionDeadline < input.preparationStart) problems.push("The submission deadline is before preparation starts.");
  if (input.reviewStart && input.submissionDeadline && input.reviewStart < input.submissionDeadline) problems.push("Review starts before the submission deadline.");
  if (input.approvalEnd && input.startDate && input.approvalEnd > input.startDate) problems.push("Approval should end before the fiscal year starts.");
  if (problems.length) throw new ValidationFailedError("Some dates are inconsistent.", {}, problems);
}

export async function createYear(actor: Actor, input: YearInput) {
  need(actor, "admin.years.manage");
  checkYearDates(input);
  if (await prisma.budgetYear.findUnique({ where: { year: input.year } })) throw new ValidationFailedError(`Budget year ${input.year} already exists.`, { year: ["Already exists"] });
  return prisma.$transaction(async (tx) => {
    const y = await tx.budgetYear.create({ data: yearData(input) });
    await audit(tx, actor, { action: "CREATE", entityType: "BudgetYear", entityId: y.id, budgetYearId: y.id, summary: `Created budget year ${y.year}`, newValue: input });
    return y;
  });
}

export async function updateYear(actor: Actor, id: string, input: YearInput) {
  need(actor, "admin.years.manage");
  checkYearDates(input);
  const current = await prisma.budgetYear.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("budget year");
  if (input.year !== current.year) {
    const used = await prisma.budgetSubmission.count({ where: { budgetYearId: id } });
    if (used) throw new BusinessRuleError("The year number cannot change once budgets exist for it.");
  }
  return prisma.$transaction(async (tx) => {
    const data = yearData(input);
    const y = await tx.budgetYear.update({ where: { id }, data });
    const diff = changedFields(current as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    if (diff) await audit(tx, actor, { action: "UPDATE", entityType: "BudgetYear", entityId: id, budgetYearId: id, summary: `Updated budget year ${y.year}`, ...diff });
    return y;
  });
}

/** Change the status of a budget year. Publishing publishes every approved budget of the year. */
export async function changeYearStatus(actor: Actor, id: string, status: BudgetYearStatus, reason: string | null) {
  need(actor, status === "PUBLISHED" ? "budget.publish" : "admin.years.manage");
  const year = await prisma.budgetYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError("budget year");
  if (!YEAR_FLOW[year.status].includes(status)) {
    throw new BusinessRuleError(`A ${year.status.toLowerCase()} budget year cannot move to ${status.toLowerCase()}. Allowed: ${YEAR_FLOW[year.status].map((s) => s.toLowerCase()).join(", ") || "none"}.`);
  }
  if (status === "PUBLISHED") {
    const pending = await prisma.budgetSubmission.count({ where: { budgetYearId: id, type: "ORIGINAL", status: { in: ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED"] } } });
    if (pending) throw new BusinessRuleError(`${pending} budget(s) of ${year.year} are still under review. Approve, return or reject them before publishing the budget.`);
  }
  return prisma.$transaction(
    async (tx) => {
      let published = 0;
      if (status === "PUBLISHED") {
        const approved = await tx.budgetSubmission.findMany({ where: { budgetYearId: id, status: "APPROVED" }, select: { id: true } });
        for (const s of approved) {
          await tx.budgetSubmission.update({ where: { id: s.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
          await publishAllocations(tx, s.id);
          await tx.approvalStep.create({ data: { submissionId: s.id, stage: "PUBLICATION", action: "PUBLISH", fromStatus: "APPROVED", toStatus: "PUBLISHED", actorId: actor.id, actorName: actor.name, comment: `Published with the ${year.year} budget` } });
          published++;
        }
      }
      await tx.budgetYear.update({ where: { id }, data: { status } });
      await audit(tx, actor, { action: status === "PUBLISHED" ? "PUBLISH" : "UPDATE", entityType: "BudgetYear", entityId: id, budgetYearId: id, summary: `Budget year ${year.year}: ${year.status} → ${status}${published ? ` (${published} budget(s) published)` : ""}`, oldValue: { status: year.status }, newValue: { status }, reason });
      return { published };
    },
    { timeout: 120_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

const USER_SORTS: Record<string, (dir: "asc" | "desc") => Prisma.UserOrderByWithRelationInput> = {
  name: (dir) => ({ fullName: dir }),
  username: (dir) => ({ username: dir }),
  email: (dir) => ({ email: dir }),
  lastLogin: (dir) => ({ lastLoginAt: { sort: dir, nulls: "last" } }),
};

export async function listUsers(filters: { q?: string; roleId?: string; mdaId?: string; active?: "active" | "inactive" | "locked"; page: number; pageSize: number; sort?: string | null }) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(filters.q ? { OR: [{ fullName: { contains: filters.q, mode: "insensitive" } }, { username: { contains: filters.q, mode: "insensitive" } }, { email: { contains: filters.q, mode: "insensitive" } }] } : {}),
    ...(filters.roleId ? { roles: { some: { roleId: filters.roleId } } } : {}),
    ...(filters.mdaId ? { mdaAssignments: { some: { mdaId: filters.mdaId } } } : {}),
    ...(filters.active === "active" ? { isActive: true } : filters.active === "inactive" ? { isActive: false } : filters.active === "locked" ? { lockedUntil: { gt: new Date() } } : {}),
  };
  const [key, dir] = (filters.sort ?? "name.asc").split(".") as [string, "asc" | "desc"];
  const orderBy = (USER_SORTS[key] ?? USER_SORTS.name)(dir === "desc" ? "desc" : "asc");
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        jobTitle: true,
        isActive: true,
        isDevSeed: true,
        lockedUntil: true,
        lastLoginAt: true,
        mustChangePassword: true,
        roles: { select: { role: { select: { key: true, name: true, nameSo: true } } } },
        mdaAssignments: { select: { type: true, mda: { select: { code: true } } } },
      },
    }),
  ]);
  return { total, rows };
}

/** Unlock an account locked after repeated failed sign-ins. */
export async function unlockUser(actor: Actor, id: string) {
  need(actor, "admin.users.manage");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("user");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await audit(tx, actor, { action: "UPDATE", entityType: "User", entityId: id, summary: `Unlocked account ${user.username}` });
  });
}

/** Random temporary password meeting the password policy. */
export function temporaryPassword() {
  const base = crypto.randomBytes(9).toString("base64url");
  return `Tmp-${base}9a`;
}

export async function createUser(actor: Actor, input: UserInput) {
  need(actor, "admin.users.manage");
  const clash = await prisma.user.findFirst({ where: { OR: [{ username: input.username }, { email: input.email }] } });
  if (clash) throw new ValidationFailedError("A user with this username or e-mail already exists.", { username: clash.username === input.username ? ["Already in use"] : [], email: clash.email === input.email ? ["Already in use"] : [] });
  const password = temporaryPassword();
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        fullName: input.fullName,
        username: input.username,
        email: input.email,
        jobTitle: input.jobTitle ?? null,
        phone: input.phone ?? null,
        locale: input.locale,
        isActive: input.isActive,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        mdaAssignments: { create: input.assignments },
      },
    });
    await audit(tx, actor, { action: "CREATE", entityType: "User", entityId: u.id, summary: `Created user ${u.username}`, newValue: { ...input } });
    return u;
  });
  return { user, temporaryPassword: password };
}

export async function updateUser(actor: Actor, id: string, input: UserInput) {
  need(actor, "admin.users.manage");
  const current = await prisma.user.findUnique({ where: { id }, include: { roles: true, mdaAssignments: true } });
  if (!current || current.deletedAt) throw new NotFoundError("user");
  const clash = await prisma.user.findFirst({ where: { id: { not: id }, OR: [{ username: input.username }, { email: input.email }] } });
  if (clash) throw new ValidationFailedError("Another user already uses this username or e-mail.");
  if (id === actor.id && !input.isActive) throw new BusinessRuleError("You cannot deactivate your own account.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { fullName: input.fullName, username: input.username, email: input.email, jobTitle: input.jobTitle ?? null, phone: input.phone ?? null, locale: input.locale, isActive: input.isActive },
    });
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) });
    await tx.userMdaAssignment.deleteMany({ where: { userId: id } });
    if (input.assignments.length) await tx.userMdaAssignment.createMany({ data: input.assignments.map((a) => ({ ...a, userId: id })), skipDuplicates: true });
    if (!input.isActive) await tx.session.deleteMany({ where: { userId: id } });
    await assertAdminRemains(tx);
    await audit(tx, actor, {
      action: current.roles.map((r) => r.roleId).sort().join() !== [...input.roleIds].sort().join() ? "PERMISSION_CHANGE" : "UPDATE",
      entityType: "User",
      entityId: id,
      summary: `Updated user ${input.username}`,
      oldValue: { fullName: current.fullName, email: current.email, isActive: current.isActive, roles: current.roles.map((r) => r.roleId), assignments: current.mdaAssignments.map((a) => ({ mdaId: a.mdaId, type: a.type })) },
      newValue: { fullName: input.fullName, email: input.email, isActive: input.isActive, roles: input.roleIds, assignments: input.assignments },
    });
  });
}

export async function resetUserPassword(actor: Actor, id: string) {
  need(actor, "admin.users.manage");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("user");
  const password = temporaryPassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, actor, { action: "PASSWORD_CHANGE", entityType: "User", entityId: id, summary: `Password reset for ${user.username} by administrator` });
  });
  return password;
}

/** Never allow the last active holder of role administration to lose it. */
async function assertAdminRemains(tx: Prisma.TransactionClient) {
  const admins = await tx.user.count({ where: { isActive: true, deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { key: "admin.roles.manage" } } } } } } } });
  if (admins === 0) throw new BusinessRuleError("At least one active user must keep the permission to manage roles. The change would lock administrators out.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles and permissions
// ─────────────────────────────────────────────────────────────────────────────

export async function saveRole(actor: Actor, id: string | null, input: RoleInput) {
  need(actor, "admin.roles.manage");
  const unknown = input.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as PermissionKey));
  if (unknown.length) throw new ValidationFailedError("Unknown permissions.", {}, unknown);
  const perms = await prisma.permission.findMany({ where: { key: { in: input.permissions } } });
  return prisma.$transaction(async (tx) => {
    let role;
    let before: string[] = [];
    if (id) {
      const current = await tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
      if (!current) throw new NotFoundError("role");
      if (current.isSystem && current.key !== input.key) throw new BusinessRuleError("The key of a system role cannot be changed.");
      before = current.permissions.map((p) => p.permission.key);
      role = await tx.role.update({ where: { id }, data: { key: input.key, name: input.name, nameSo: input.nameSo ?? null, description: input.description ?? null } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
    } else {
      if (await tx.role.findUnique({ where: { key: input.key } })) throw new ValidationFailedError(`Role ${input.key} already exists.`);
      role = await tx.role.create({ data: { key: input.key, name: input.name, nameSo: input.nameSo ?? null, description: input.description ?? null } });
    }
    await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await assertAdminRemains(tx);
    await audit(tx, actor, {
      action: "PERMISSION_CHANGE",
      entityType: "Role",
      entityId: role.id,
      summary: `${id ? "Updated" : "Created"} role ${role.key}`,
      oldValue: id ? { permissions: before } : undefined,
      newValue: { name: input.name, permissions: input.permissions },
    });
    return role;
  });
}

export async function deleteRole(actor: Actor, id: string) {
  need(actor, "admin.roles.manage");
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new NotFoundError("role");
  if (role.isSystem) throw new BusinessRuleError("System roles cannot be deleted; remove their permissions instead.");
  if (role._count.users) throw new BusinessRuleError(`The role is assigned to ${role._count.users} user(s). Reassign them first.`);
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await audit(tx, actor, { action: "DELETE", entityType: "Role", entityId: id, summary: `Deleted role ${role.key}` });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings, lookups, rules, categories
// ─────────────────────────────────────────────────────────────────────────────

export async function saveSetting<K extends keyof AppSettings>(actor: Actor, key: K, value: AppSettings[K]) {
  need(actor, "admin.settings.manage");
  if (!(key in DEFAULT_SETTINGS)) throw new ValidationFailedError(`Unknown setting ${String(key)}.`);
  const before = await prisma.systemSetting.findUnique({ where: { key: key as string } });
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({ where: { key: key as string }, create: { key: key as string, value: value as object, updatedById: actor.id }, update: { value: value as object, updatedById: actor.id } });
    await audit(tx, actor, { action: "UPDATE", entityType: "SystemSetting", entityId: key as string, summary: `Updated setting ${String(key)}`, oldValue: before?.value, newValue: value });
  });
  invalidateSettingsCache();
}

export async function saveLookup(actor: Actor, id: string | null, input: { category: "AGENCY_TYPE" | "REGION" | "MDA_CATEGORY" | "FUNDING_SOURCE" | "PROCUREMENT_METHOD"; code: string; name: string; nameEn?: string | null; sortOrder: number; isActive: boolean }) {
  need(actor, "admin.settings.manage");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.lookupValue.findUnique({ where: { category_code: { category: input.category, code: input.code } } });
    if (existing && existing.id !== id) throw new ValidationFailedError(`Code ${input.code} already exists in this list.`);
    const row = id ? await tx.lookupValue.update({ where: { id }, data: { ...input, nameEn: input.nameEn ?? null } }) : await tx.lookupValue.create({ data: { ...input, nameEn: input.nameEn ?? null } });
    await audit(tx, actor, { action: id ? "UPDATE" : "CREATE", entityType: "LookupValue", entityId: row.id, summary: `${input.category}: ${input.code} ${input.name}`, newValue: input });
    return row;
  });
}

export async function saveRule(actor: Actor, input: { code: string; severity: "ERROR" | "WARNING" | "INFO"; isActive: boolean; tolerance: number; thresholdPercent?: number | null }) {
  need(actor, "admin.validation.manage");
  const rule = await prisma.validationRule.findUnique({ where: { code: input.code } });
  if (!rule) throw new NotFoundError("validation rule");
  const params = input.thresholdPercent !== undefined && input.thresholdPercent !== null ? { ...((rule.params as object) ?? {}), thresholdPercent: input.thresholdPercent } : rule.params;
  await prisma.$transaction(async (tx) => {
    await tx.validationRule.update({ where: { code: input.code }, data: { severity: input.severity, isActive: input.isActive, tolerance: input.tolerance, params: (params as object) ?? undefined } });
    await audit(tx, actor, { action: "UPDATE", entityType: "ValidationRule", entityId: rule.id, summary: `Validation rule ${rule.code} updated`, oldValue: { severity: rule.severity, isActive: rule.isActive, tolerance: rule.tolerance, params: rule.params }, newValue: { ...input } });
  });
  invalidateReferenceCache();
}

export async function saveCategory(actor: Actor, input: { id: string; name: string; nameSo: string; procurementEligible: boolean; isActive: boolean; sortOrder: number }) {
  need(actor, "admin.codes.manage");
  const current = await prisma.budgetCategory.findUnique({ where: { id: input.id } });
  if (!current) throw new NotFoundError("category");
  await prisma.$transaction(async (tx) => {
    const { id, ...data } = input;
    await tx.budgetCategory.update({ where: { id }, data });
    const diff = changedFields(current as unknown as Record<string, unknown>, data);
    if (diff) await audit(tx, actor, { action: "UPDATE", entityType: "BudgetCategory", entityId: id, summary: `Budget category ${current.code} updated`, ...diff });
  });
  invalidateReferenceCache();
}

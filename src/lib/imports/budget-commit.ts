/**
 * Validation against reference data and transactional commit of budget entries
 * produced by the import profiles (budget workbook, generic budget lines).
 *
 * Historical budgets are written as approved, locked submissions (published when the
 * budget year is already in execution or closed). Budgets for the preparation year are
 * written as drafts. Existing approved budgets are never modified: rows targeting them
 * are reported as duplicates.
 */
import type { Actor } from "@/lib/auth/actor";
import { toAmount } from "@/lib/calculations";
import type { Tx } from "@/lib/db";
import { parallel, prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { publishAllocations } from "@/lib/services/execution-baseline";
import { refreshSubmissionTotals } from "@/lib/services/submission-data";
import { createVersion } from "@/lib/services/versions";
import { categoryForCode } from "./reference-data";
import { findParentCode, levelOfCode } from "./reference-builder";
import { deriveStatus, type BudgetEntry, type ParsedRow } from "./types";

type Client = Tx | typeof prisma;

export interface ReferenceIndex {
  mdas: Map<string, { id: string; code: string; name: string; isActive: boolean }>;
  codes: Map<string, { id: string; code: string; effectiveFromYear: number; effectiveToYear: number | null; isActive: boolean }[]>;
  mappings: Map<string, { targetCodeId: string; targetCode: string }>;
  years: Map<number, { id: string; status: string }>;
  submissions: Map<string, { id: string; status: string; isLocked: boolean }>;
}

export async function loadReferenceIndex(client: Client): Promise<ReferenceIndex> {
  const [mdas, codes, mappings, years, submissions] = await parallel(
    client,
    () => client.mda.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, isActive: true } }),
    () => client.budgetCode.findMany({ select: { id: true, code: true, kind: true, effectiveFromYear: true, effectiveToYear: true, isActive: true } }),
    () => client.codeMapping.findMany({ include: { targetCode: { select: { code: true } } } }),
    () => client.budgetYear.findMany({ select: { id: true, year: true, status: true } }),
    () => client.budgetSubmission.findMany({
      where: { type: "ORIGINAL" },
      select: { id: true, status: true, isLocked: true, mda: { select: { code: true } }, budgetYear: { select: { year: true } } },
    }),
  );
  const codeMap: ReferenceIndex["codes"] = new Map();
  for (const c of codes) {
    const key = `${c.kind}:${c.code}`;
    codeMap.set(key, [...(codeMap.get(key) ?? []), c]);
  }
  return {
    mdas: new Map(mdas.map((m) => [m.code, m])),
    codes: codeMap,
    mappings: new Map(mappings.map((m) => [`${m.scheme}:${m.sourceCode}`, { targetCodeId: m.targetCodeId, targetCode: m.targetCode.code }])),
    years: new Map(years.map((y) => [y.year, { id: y.id, status: y.status }])),
    submissions: new Map(submissions.map((s) => [`${s.budgetYear.year}:${s.mda.code}`, { id: s.id, status: s.status, isLocked: s.isLocked }])),
  };
}

export interface CommitOptions {
  years: { year: number; target: "APPROVED" | "DRAFT" | "SKIP" }[];
  createMissingCodes: boolean;
  createMissingMdas: boolean;
}

function codeFor(index: ReferenceIndex, kind: string, code: string, year: number) {
  return (index.codes.get(`${kind}:${code}`) ?? []).find((c) => c.effectiveFromYear <= year && (c.effectiveToYear === null || c.effectiveToYear >= year));
}

/** Resolve codes, MDAs, years and existing budgets for every entry; add issues and derive row statuses. */
export function resolveEntries(rows: ParsedRow[], index: ReferenceIndex, options: CommitOptions): void {
  const targetOf = new Map(options.years.map((y) => [y.year, y.target]));
  for (const row of rows) {
    const entries = row.data.entries ?? [];
    if (row.status === "IMPORTED" || entries.length === 0) {
      row.status = deriveStatus(row);
      continue;
    }
    // Remove issues from a previous resolution pass (re-validation after corrections).
    row.issues = row.issues.filter((i) => !i.code.startsWith("REF_"));
    const add = (severity: "ERROR" | "WARNING" | "INFO", code: string, message: string) => {
      if (!row.issues.some((i) => i.code === code && i.message === message)) row.issues.push({ severity, code, message });
    };
    for (const e of entries) {
      e.blocked = null;
      e.targetCodeId = null;
      e.targetCode = null;
      if (e.duplicateOf) {
        e.blocked = `DUPLICATE: same year, MDA and code as ${e.duplicateOf}`;
        continue;
      }
      const year = index.years.get(e.year);
      const target = targetOf.get(e.year) ?? "SKIP";
      if (target === "SKIP") {
        e.blocked = "SKIPPED: year not selected";
        continue;
      }
      if (!year) {
        add("ERROR", "REF_UNKNOWN_YEAR", `Budget year ${e.year} is not set up — create it under Administration → Budget Years`);
        e.blocked = "ERROR";
        continue;
      }
      if (target === "DRAFT" && !["PREPARATION", "DRAFT"].includes(year.status)) {
        add("ERROR", "REF_YEAR_NOT_OPEN", `Budget year ${e.year} is ${year.status.toLowerCase()}; draft budgets can only be imported while the year is in preparation`);
        e.blocked = "ERROR";
        continue;
      }
      if (target === "APPROVED" && ["PREPARATION", "DRAFT", "REVIEW"].includes(year.status)) {
        add("ERROR", "REF_YEAR_NOT_APPROVED", `Budget year ${e.year} is ${year.status.toLowerCase()}; its budgets must go through review and approval — import them as drafts instead`);
        e.blocked = "ERROR";
        continue;
      }
      const mda = index.mdas.get(e.mdaCode);
      if (!mda) {
        if (options.createMissingMdas) add("WARNING", "REF_NEW_MDA", `MDA ${e.mdaCode}${row.data.mdaName ? ` (${row.data.mdaName})` : ""} does not exist and will be created`);
        else {
          add("ERROR", "REF_UNKNOWN_MDA", `Unknown MDA ${e.mdaCode}${row.data.mdaName ? ` (${row.data.mdaName})` : ""}`);
          e.blocked = "ERROR";
          continue;
        }
      } else if (!mda.isActive) {
        add("ERROR", "REF_INACTIVE_MDA", `MDA ${e.mdaCode} is inactive`);
        e.blocked = "ERROR";
        continue;
      }
      if (e.scheme) {
        const mapping = index.mappings.get(`${e.scheme}:${e.sourceCode}`);
        if (!mapping) {
          add("ERROR", "REF_NO_MAPPING", `Summary code ${e.sourceCode} has no crosswalk to the chart of accounts (Administration → Budget Codes → Code mappings)`);
          e.blocked = "ERROR";
          continue;
        }
        e.targetCodeId = mapping.targetCodeId;
        e.targetCode = mapping.targetCode;
        if (mapping.targetCode !== e.sourceCode) add("INFO", "REF_MAPPED", `Summary code ${e.sourceCode} imported as ${mapping.targetCode}`);
      } else {
        const code = codeFor(index, e.kind, e.sourceCode, e.year);
        if (!code) {
          if (options.createMissingCodes) add("WARNING", "REF_NEW_CODE", `${e.kind === "REVENUE" ? "Revenue" : "Expenditure"} code ${e.sourceCode} does not exist and will be created`);
          else {
            add("ERROR", "REF_UNKNOWN_CODE", `Unknown ${e.kind.toLowerCase()} code ${e.sourceCode} for ${e.year}`);
            e.blocked = "ERROR";
            continue;
          }
        } else if (!code.isActive) {
          add("ERROR", "REF_INACTIVE_CODE", `Code ${e.sourceCode} is inactive`);
          e.blocked = "ERROR";
          continue;
        } else {
          e.targetCodeId = code.id;
          e.targetCode = code.code;
        }
      }
      const existing = index.submissions.get(`${e.year}:${e.mdaCode}`);
      if (existing) {
        if (existing.isLocked || ["APPROVED", "PUBLISHED"].includes(existing.status)) {
          e.blocked = `DUPLICATE: an approved ${e.year} budget already exists for ${e.mdaCode}`;
          add("WARNING", "REF_EXISTING_APPROVED", `An approved ${e.year} budget already exists for MDA ${e.mdaCode}; approved budgets cannot be overwritten (create a revision instead)`);
        } else if (!["DRAFT", "RETURNED"].includes(existing.status)) {
          e.blocked = "ERROR";
          add("ERROR", "REF_IN_REVIEW", `The ${e.year} budget of MDA ${e.mdaCode} is ${existing.status.toLowerCase().replace("_", " ")} and cannot be changed by an import`);
        } else if (target === "APPROVED") {
          e.blocked = "ERROR";
          add("ERROR", "REF_DRAFT_EXISTS", `A draft ${e.year} budget exists for MDA ${e.mdaCode}; submit it through the workflow or import these amounts as a draft`);
        } else {
          add("INFO", "REF_UPDATE_DRAFT", `Amounts will update the existing ${e.year} draft of MDA ${e.mdaCode}`);
        }
      }
    }
    row.status = deriveStatus(row);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────────────────────────────────────

async function ensureMda(tx: Tx, index: ReferenceIndex, code: string, name: string | undefined) {
  const existing = index.mdas.get(code);
  if (existing) return existing.id;
  const sector = await tx.sector.findFirst({ where: { code: `${code[0]}00` } });
  if (!sector) throw new Error(`No sector ${code[0]}00 for new MDA ${code}`);
  const mda = await tx.mda.create({ data: { code, name: name ?? code, sectorId: sector.id } });
  index.mdas.set(code, { id: mda.id, code, name: mda.name, isActive: true });
  return mda.id;
}

export async function ensureCode(tx: Tx, index: ReferenceIndex, kind: "REVENUE" | "EXPENDITURE", code: string, name: string, year: number) {
  const found = codeFor(index, kind, code, year);
  if (found) return found.id;
  const existingCodes = new Set([...index.codes.keys()].filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1)));
  const parentCode = findParentCode(code, existingCodes);
  const parent = parentCode ? codeFor(index, kind, parentCode, year) ?? (index.codes.get(`${kind}:${parentCode}`) ?? [])[0] : null;
  const parentRow = parent ? await tx.budgetCode.findUnique({ where: { id: parent.id } }) : null;
  const categoryCode = categoryForCode(code);
  const category = categoryCode ? await tx.budgetCategory.findUnique({ where: { code: categoryCode } }) : null;
  const created = await tx.budgetCode.create({
    data: {
      code,
      name,
      kind,
      parentId: parentRow?.id ?? null,
      level: levelOfCode(code),
      path: parentRow ? `${parentRow.path}/${code}` : code,
      categoryId: category?.id ?? parentRow?.categoryId ?? null,
      isPostable: true,
      effectiveFromYear: Math.min(year, 2020),
    },
  });
  if (parentRow?.isPostable) await tx.budgetCode.update({ where: { id: parentRow.id }, data: { isPostable: false } });
  index.codes.set(`${kind}:${code}`, [...(index.codes.get(`${kind}:${code}`) ?? []), { id: created.id, code, effectiveFromYear: created.effectiveFromYear, effectiveToYear: null, isActive: true }]);
  return created.id;
}

export interface CommitSummary {
  submissionsCreated: number;
  submissionsUpdated: number;
  linesWritten: number;
  mdasCreated: number;
  codesCreated: number;
  groups: { year: number; mdaCode: string; submissionId: string; status: string; lines: number; total: number }[];
}

/**
 * Write all committable entries. Rows must have been resolved with resolveEntries.
 * `rowFilter` selects rows (by default VALID and WARNING rows).
 */
export async function commitBudgetEntries(
  tx: Tx,
  actor: Actor,
  rows: ParsedRow[],
  options: CommitOptions & { label: string },
): Promise<CommitSummary> {
  const index = await loadReferenceIndex(tx);
  const targetOf = new Map(options.years.map((y) => [y.year, y.target]));
  const summary: CommitSummary = { submissionsCreated: 0, submissionsUpdated: 0, linesWritten: 0, mdasCreated: 0, codesCreated: 0, groups: [] };
  const committable = rows.filter((r) => (r.status === "VALID" || r.status === "WARNING") && r.data.role === "line");

  const groups = new Map<string, { year: number; mdaCode: string; mdaName?: string; entries: BudgetEntry[]; rows: ParsedRow[] }>();
  for (const row of committable) {
    for (const e of row.data.entries ?? []) {
      if (e.blocked) continue;
      const key = `${e.year}:${e.mdaCode}`;
      const g = groups.get(key) ?? { year: e.year, mdaCode: e.mdaCode, mdaName: row.data.mdaName, entries: [], rows: [] };
      g.entries.push(e);
      if (!g.rows.includes(row)) g.rows.push(row);
      groups.set(key, g);
    }
  }

  for (const g of [...groups.values()].sort((a, b) => a.year - b.year || a.mdaCode.localeCompare(b.mdaCode))) {
    const target = targetOf.get(g.year);
    if (!target || target === "SKIP") continue;
    const year = index.years.get(g.year)!;
    const mdasBefore = index.mdas.size;
    const mdaId = await ensureMda(tx, index, g.mdaCode, g.mdaName);
    if (index.mdas.size > mdasBefore) summary.mdasCreated++;

    // Aggregate by target code (e.g. two summary columns mapping to the same code).
    const byCode = new Map<string, { kind: "REVENUE" | "EXPENDITURE"; amount: number; description: string | null; refs: string[]; source: "IMPORT" | "DEV_SEED" }>();
    for (const e of g.entries) {
      let codeId = e.targetCodeId;
      if (!codeId) {
        const before = [...index.codes.values()].flat().length;
        codeId = await ensureCode(tx, index, e.kind, e.sourceCode, e.description ?? e.sourceCode, g.year);
        if ([...index.codes.values()].flat().length > before) summary.codesCreated++;
        e.targetCodeId = codeId;
      }
      const cur = byCode.get(codeId);
      byCode.set(codeId, {
        kind: e.kind,
        amount: toAmount((cur?.amount ?? 0) + e.amount),
        description: cur?.description ?? e.description ?? null,
        refs: [...(cur?.refs ?? []), e.sourceRef],
        source: cur?.source === "IMPORT" || (e.source ?? "IMPORT") === "IMPORT" ? "IMPORT" : "DEV_SEED",
      });
    }

    const existing = index.submissions.get(`${g.year}:${g.mdaCode}`);
    let submissionId: string;
    let status: string;
    if (existing) {
      // Update a draft (the resolver guarantees it is editable).
      submissionId = existing.id;
      status = existing.status;
      for (const [codeId, v] of byCode) {
        const line = await tx.budgetLine.findFirst({ where: { submissionId, budgetCodeId: codeId, capitalProjectId: null } });
        if (line) await tx.budgetLine.update({ where: { id: line.id }, data: { amount: v.amount, source: v.source, sourceRef: v.refs.slice(0, 3).join(", "), updatedById: actor.id === "system" ? null : actor.id } });
        else await tx.budgetLine.create({ data: { submissionId, budgetCodeId: codeId, kind: v.kind, amount: v.amount, description: v.description, source: v.source, sourceRef: v.refs.slice(0, 3).join(", "), createdById: actor.id === "system" ? null : actor.id } });
        summary.linesWritten++;
      }
      await refreshSubmissionTotals(tx, submissionId);
      summary.submissionsUpdated++;
    } else {
      const mda = await tx.mda.findUniqueOrThrow({ where: { id: mdaId }, include: { sector: true } });
      const approved = target === "APPROVED";
      status = approved ? (["PUBLISHED", "ACTIVE", "CLOSED"].includes(year.status) ? "PUBLISHED" : "APPROVED") : "DRAFT";
      const devSeedOnly = [...byCode.values()].every((v) => v.source === "DEV_SEED");
      const submission = await tx.budgetSubmission.create({
        data: {
          budgetYearId: year.id,
          mdaId,
          status: "DRAFT",
          source: devSeedOnly ? "DEV_SEED" : "IMPORT",
          allocationNumber: mda.code,
          agencyCategory: mda.sector.name,
          accountingOfficer: mda.accountingOfficer,
          contactPerson: mda.contactPerson ?? mda.budgetOfficer,
          telephone: mda.phone,
          email: mda.email,
          createdById: actor.id === "system" ? null : actor.id,
        },
      });
      submissionId = submission.id;
      let order = 0;
      await tx.budgetLine.createMany({
        data: [...byCode.entries()].map(([codeId, v]) => ({
          submissionId,
          budgetCodeId: codeId,
          kind: v.kind,
          amount: v.amount,
          description: v.description,
          source: v.source,
          sourceRef: v.refs.slice(0, 3).join(", ") + (v.refs.length > 3 ? ` (+${v.refs.length - 3})` : ""),
          sortOrder: order++,
          createdById: actor.id === "system" ? null : actor.id,
        })),
      });
      await tx.cashFlowForecast.createMany({ data: (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => ({ submissionId, quarter, amount: 0 })) });
      summary.linesWritten += byCode.size;
      await refreshSubmissionTotals(tx, submissionId);
      await tx.approvalStep.create({
        data: {
          submissionId,
          stage: "PREPARATION",
          action: "CREATE",
          toStatus: "DRAFT",
          actorId: actor.id === "system" ? null : actor.id,
          actorName: actor.name,
          comment: `Imported from ${options.label}`,
        },
      });
      if (approved) {
        const now = new Date();
        await tx.budgetSubmission.update({ where: { id: submissionId }, data: { status: status as "APPROVED" | "PUBLISHED", approvedAt: now, publishedAt: status === "PUBLISHED" ? now : null } });
        const version = await createVersion(tx, actor.id === "system" ? null : actor, submissionId, { status: status as "APPROVED", reason: `Historical approved budget imported from ${options.label}`, label: "Imported approved budget v1" });
        await tx.approvalStep.create({
          data: {
            submissionId,
            versionId: version.id,
            stage: status === "PUBLISHED" ? "PUBLICATION" : "FINAL_APPROVAL",
            action: status === "PUBLISHED" ? "PUBLISH" : "APPROVE",
            fromStatus: "DRAFT",
            toStatus: status as "APPROVED" | "PUBLISHED",
            actorId: actor.id === "system" ? null : actor.id,
            actorName: actor.name,
            comment: `Historical approved budget imported from ${options.label}`,
          },
        });
        await tx.budgetSubmission.update({ where: { id: submissionId }, data: { isLocked: true } });
        if (status === "PUBLISHED") await publishAllocations(tx, submissionId);
      }
      index.submissions.set(`${g.year}:${g.mdaCode}`, { id: submissionId, status, isLocked: approved });
      summary.submissionsCreated++;
    }
    const total = toAmount([...byCode.values()].reduce((a, v) => a + v.amount, 0));
    summary.groups.push({ year: g.year, mdaCode: g.mdaCode, submissionId, status, lines: byCode.size, total });
    for (const row of g.rows) {
      row.status = "IMPORTED";
    }
    await audit(tx, actor.id === "system" ? null : actor, {
      action: "IMPORT",
      entityType: "BudgetSubmission",
      entityId: submissionId,
      mdaId,
      budgetYearId: year.id,
      summary: `${existing ? "Updated" : "Created"} ${g.year} budget of ${g.mdaCode} from ${options.label}: ${byCode.size} line(s), total ${total.toLocaleString("en-US")}`,
    });
  }
  return summary;
}

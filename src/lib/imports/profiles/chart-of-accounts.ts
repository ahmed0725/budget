/**
 * Import profile: chart of accounts (classification codes). New codes are created
 * under their parent (given explicitly or found by the longest matching code prefix);
 * existing codes get their names updated. Codes are never deleted by an import.
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import type { Tx } from "@/lib/db";
import { parallel, prisma } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { levelOfCode } from "../reference-builder";
import { categoryForCode } from "../reference-data";
import type { ParsedRow, RowIssue } from "../types";
import { readField, type FieldDef, type FieldValue } from "./tabular";

export const CHART_FIELDS: FieldDef[] = [
  { key: "code", label: "Code", required: true, type: "code", match: [/^(code|koodh|madax|account)/i] },
  { key: "name", label: "Official name (Somali)", required: true, type: "text", match: [/^(name|magac|faah|desc)/i, /somali/i] },
  { key: "nameEn", label: "English name", required: false, type: "text", match: [/english|name.?en|ingiriis/i] },
  { key: "kind", label: "Revenue / expenditure", required: false, type: "text", match: [/^(kind|type|nooc)/i] },
  { key: "parentCode", label: "Parent code", required: false, type: "code", match: [/parent|waalid/i] },
  { key: "category", label: "Budget category code", required: false, type: "text", match: [/categ|qayb/i] },
  { key: "effectiveFrom", label: "Effective from year", required: false, type: "year", match: [/effective|from|laga/i] },
];

export const chartOptionsSchema = z.object({
  sheet: z.string().min(1),
  headerRow: z.number().int().min(1),
  columns: z.record(z.string(), z.string()),
  kind: z.enum(["REVENUE", "EXPENDITURE"]).nullable(),
  effectiveFromYear: z.number().int().min(1990).max(2100),
});
export type ChartOptions = z.infer<typeof chartOptionsSchema>;

interface ChartData {
  code: string;
  kind: "REVENUE" | "EXPENDITURE";
  name: string;
  nameEn: string | null;
  parentCode: string | null;
  category: string | null;
  effectiveFrom: number;
  duplicateOf?: number | null;
  action?: "CREATE" | "UPDATE" | "UNCHANGED";
  existingId?: string;
  resolvedParent?: string | null;
  categoryId?: string | null;
}

export function chartStatus(row: ParsedRow): ParsedRow["status"] {
  if (row.status === "IMPORTED") return "IMPORTED";
  if (row.issues.some((i) => i.severity === "ERROR")) return "ERROR";
  const d = row.data.chart as ChartData | undefined;
  if (d?.duplicateOf || d?.action === "UNCHANGED") return "DUPLICATE";
  if (row.issues.some((i) => i.severity === "WARNING")) return "WARNING";
  return "VALID";
}

export function interpretChart(rows: ParsedRow[], options: ChartOptions): void {
  const f = (k: string) => CHART_FIELDS.find((x) => x.key === k)!;
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "IMPORTED") continue;
    const values = (row.data.values ?? {}) as Record<string, FieldValue>;
    const issues: RowIssue[] = [];
    const code = readField(values, f("code"), issues) as string | null;
    const name = readField(values, f("name"), issues) as string | null;
    const nameEn = readField(values, f("nameEn"), issues) as string | null;
    const kindText = readField(values, f("kind"), issues) as string | null;
    const parentCode = readField(values, f("parentCode"), issues) as string | null;
    const category = readField(values, f("category"), issues) as string | null;
    const effectiveFrom = (readField(values, f("effectiveFrom"), issues) as number | null) ?? options.effectiveFromYear;
    let kind: "REVENUE" | "EXPENDITURE" | null = options.kind;
    if (kindText) kind = /^(rev|dakh|1$)/i.test(kindText) ? "REVENUE" : /^(exp|khar|2$|3$)/i.test(kindText) ? "EXPENDITURE" : null;
    if (!kind && code) kind = code.startsWith("1") ? "REVENUE" : code.startsWith("2") || code.startsWith("3") ? "EXPENDITURE" : null;
    if (code && !kind) issues.push({ severity: "ERROR", code: "INVALID_KIND", message: `Cannot tell whether code ${code} is revenue or expenditure; add a type column or choose the kind` });
    if (code && parentCode && !(code.startsWith(parentCode) && code.length > parentCode.length)) {
      issues.push({ severity: "WARNING", code: "PARENT_PREFIX", message: `Parent ${parentCode} is not a prefix of ${code}; check the hierarchy` });
    }
    row.issues = issues;
    row.data = { ...row.data, role: "line", code: code ?? undefined, description: name ?? undefined, chart: undefined };
    if (code && name && kind && !issues.some((i) => i.severity === "ERROR")) {
      const key = `${kind}|${code}`;
      const first = seen.get(key);
      if (first) issues.push({ severity: "WARNING", code: "DUPLICATE_ROW", message: `Code ${code} already appears in row ${first}; this row is not imported` });
      else seen.set(key, row.rowNumber);
      row.data.chart = { code, kind, name, nameEn, parentCode, category, effectiveFrom, duplicateOf: first ?? null } satisfies ChartData;
    }
    row.status = chartStatus(row);
  }
}

type Client = Tx | typeof prisma;

export async function resolveChart(rows: ParsedRow[], client: Client): Promise<void> {
  const [codes, categories] = await parallel(
    client,
    () => client.budgetCode.findMany({ select: { id: true, code: true, kind: true, name: true, nameEn: true, parentId: true, effectiveFromYear: true, effectiveToYear: true } }),
    () => client.budgetCategory.findMany({ select: { id: true, code: true, kind: true } }),
  );
  const existing = new Map(codes.map((c) => [`${c.kind}|${c.code}`, c]));
  const fileCodes = new Set(rows.map((r) => r.data.chart as ChartData | undefined).filter((d): d is ChartData => Boolean(d && !d.duplicateOf)).map((d) => `${d.kind}|${d.code}`));
  for (const row of rows) {
    const d = row.data.chart as ChartData | undefined;
    if (row.status === "IMPORTED" || !d) continue;
    row.issues = row.issues.filter((i) => !i.code.startsWith("REF_"));
    const add = (severity: RowIssue["severity"], code: string, message: string) => row.issues.push({ severity, code, message });
    const known = (c: string) => existing.has(`${d.kind}|${c}`) || fileCodes.has(`${d.kind}|${c}`);
    const current = existing.get(`${d.kind}|${d.code}`);
    if (current) {
      d.existingId = current.id;
      const changed = current.name !== d.name || (d.nameEn !== null && current.nameEn !== d.nameEn);
      d.action = changed ? "UPDATE" : "UNCHANGED";
      if (changed) add("INFO", "REF_RENAME", `Existing code ${d.code}: name changes from "${current.name}" to "${d.name}"`);
      else add("INFO", "REF_EXISTS", `Code ${d.code} already exists with the same name`);
    } else {
      d.action = "CREATE";
      if (d.parentCode) {
        if (!known(d.parentCode)) add("ERROR", "REF_UNKNOWN_PARENT", `Parent code ${d.parentCode} does not exist and is not in this file`);
        d.resolvedParent = d.parentCode;
      } else {
        let parent: string | null = null;
        for (let len = d.code.length - 1; len >= 1; len--) {
          const candidate = d.code.slice(0, len);
          if (known(candidate)) {
            parent = candidate;
            break;
          }
        }
        d.resolvedParent = parent;
        if (!parent && d.code.length > 1) add("WARNING", "REF_NO_PARENT", `No parent found for ${d.code}; it will be created at the top of the hierarchy`);
      }
    }
    if (d.category) {
      const cat = categories.find((c) => c.code === d.category!.toUpperCase());
      if (!cat) add("ERROR", "REF_UNKNOWN_CATEGORY", `Budget category ${d.category} does not exist (see Administration → Settings → Budget categories)`);
      else if (cat.kind !== d.kind) add("ERROR", "REF_CATEGORY_KIND", `Category ${d.category} is for ${cat.kind.toLowerCase()} codes`);
      else d.categoryId = cat.id;
    } else {
      const guess = categoryForCode(d.code);
      d.categoryId = guess ? (categories.find((c) => c.code === guess)?.id ?? null) : null;
    }
    row.status = chartStatus(row);
  }
}

export async function commitChart(tx: Tx, actor: Actor, rows: ParsedRow[], label: string) {
  const idOf = new Map<string, { id: string; path: string; categoryId: string | null }>();
  for (const c of await tx.budgetCode.findMany({ select: { id: true, code: true, kind: true, path: true, categoryId: true } })) idOf.set(`${c.kind}|${c.code}`, { id: c.id, path: c.path, categoryId: c.categoryId });
  const eligible = rows.filter((r) => (r.status === "VALID" || r.status === "WARNING") && r.data.chart);
  const items = eligible.map((r) => ({ row: r, d: r.data.chart as ChartData })).filter((x) => !x.d.duplicateOf && x.d.action !== "UNCHANGED");
  let created = 0;
  let updated = 0;
  // Parents first.
  for (const { row, d } of items.sort((a, b) => a.d.code.length - b.d.code.length || a.d.code.localeCompare(b.d.code))) {
    if (d.action === "UPDATE" && d.existingId) {
      await tx.budgetCode.update({ where: { id: d.existingId }, data: { name: d.name, ...(d.nameEn !== null ? { nameEn: d.nameEn } : {}), ...(d.categoryId ? { categoryId: d.categoryId } : {}) } });
      updated++;
    } else {
      const parent = d.resolvedParent ? idOf.get(`${d.kind}|${d.resolvedParent}`) : undefined;
      const c = await tx.budgetCode.create({
        data: {
          code: d.code,
          kind: d.kind,
          name: d.name,
          nameEn: d.nameEn,
          parentId: parent?.id ?? null,
          level: levelOfCode(d.code),
          path: parent ? `${parent.path}/${d.code}` : d.code,
          categoryId: d.categoryId ?? parent?.categoryId ?? null,
          isPostable: true,
          effectiveFromYear: d.effectiveFrom,
        },
      });
      if (parent) {
        const lines = await tx.budgetLine.count({ where: { budgetCodeId: parent.id } });
        if (lines === 0) await tx.budgetCode.update({ where: { id: parent.id }, data: { isPostable: false } });
      }
      idOf.set(`${d.kind}|${d.code}`, { id: c.id, path: c.path, categoryId: c.categoryId });
      created++;
    }
    row.status = "IMPORTED";
  }
  for (const r of eligible) if (r.status !== "IMPORTED") r.status = "SKIPPED";
  await audit(tx, actor, { action: "IMPORT", entityType: "BudgetCode", summary: `Chart of accounts imported from ${label}: ${created} code(s) created, ${updated} renamed` });
  return { created, updated };
}

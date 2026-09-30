import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { codeTree } from "@/lib/services/admin";
import { cn } from "@/lib/utils";
import { CodeTreeView, type FlatCode } from "./code-tree";
import { CodeMappings } from "./code-mappings";

export const metadata: Metadata = { title: "Budget codes" };

export default async function BudgetCodesPage(props: PageProps<"/administration/budget-codes">) {
  await requirePagePermission("admin.codes.manage");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const kind = param(sp, "kind") === "REVENUE" ? "REVENUE" : "EXPENDITURE";
  const view = param(sp, "view") === "mappings" ? "mappings" : "tree";
  const q = param(sp, "q")?.trim() || undefined;
  const [tree, categories, flat, mappings] = await Promise.all([
    codeTree(kind, { q }),
    prisma.budgetCategory.findMany({ where: { kind }, orderBy: { sortOrder: "asc" } }),
    prisma.budgetCode.findMany({ where: { kind }, orderBy: { path: "asc" }, select: { id: true, code: true, name: true, nameEn: true, level: true, parentId: true, categoryId: true, isPostable: true, isActive: true, effectiveFromYear: true, effectiveToYear: true, description: true, sortOrder: true } }),
    view === "mappings" ? prisma.codeMapping.findMany({ include: { targetCode: { select: { code: true, name: true } } }, orderBy: [{ scheme: "asc" }, { sourceCode: "asc" }] }) : Promise.resolve([]),
  ]);
  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted", active && "border-primary/40 bg-primary/5 font-medium text-primary")}>
      {label}
    </Link>
  );
  return (
    <div>
      <PageHeader title={t("nav.budgetCodes")} description={t("admin.codeTree")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.budgetCodes") }]} />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label={t("nav.budgetCodes")}>
        {tab(t("nav.expenditureCodes"), "/administration/budget-codes?kind=EXPENDITURE", view === "tree" && kind === "EXPENDITURE")}
        {tab(t("nav.revenueCodes"), "/administration/budget-codes?kind=REVENUE", view === "tree" && kind === "REVENUE")}
        {tab(t("admin.codeMappings"), `/administration/budget-codes?view=mappings&kind=${kind}`, view === "mappings")}
      </nav>
      {view === "tree" ? (
        <CodeTreeView
          kind={kind}
          tree={tree}
          query={q ?? ""}
          categories={categories.map((c) => ({ value: c.id, label: locale === "so" ? c.nameSo : c.name }))}
          flat={flat as FlatCode[]}
        />
      ) : (
        <CodeMappings
          mappings={mappings.map((m) => ({ id: m.id, scheme: m.scheme, sourceCode: m.sourceCode, sourceName: m.sourceName, target: `${m.targetCode.code} ${m.targetCode.name}`, targetCodeId: m.targetCodeId, notes: m.notes }))}
          targets={(await prisma.budgetCode.findMany({ where: { kind: "EXPENDITURE" }, orderBy: { path: "asc" }, select: { id: true, code: true, name: true } })).map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))}
        />
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { SearchInput } from "@/components/app/filter-bar";
import { SelectField, SwitchField, TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import type { CodeNode } from "@/lib/services/admin";
import { cn } from "@/lib/utils";
import { codeSchema, type CodeInput } from "@/lib/validations/admin";
import { saveCodeAction } from "../actions";

export interface FlatCode {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  level: number;
  parentId: string | null;
  categoryId: string | null;
  isPostable: boolean;
  isActive: boolean;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  description: string | null;
  sortOrder: number;
}

export function CodeTreeView({ kind, tree, query, categories, flat }: { kind: "REVENUE" | "EXPENDITURE"; tree: CodeNode[]; query: string; categories: { value: string; label: string }[]; flat: FlatCode[] }) {
  const { t, locale } = useT();
  const allIds = useMemo(() => flat.map((f) => f.id), [flat]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(query ? allIds : tree.map((n) => n.id)));
  const [editing, setEditing] = useState<{ id: string | null; parentId: string | null } | null>(null);
  const catLabel = new Map(categories.map((c) => [c.value, c.label]));
  const toggle = (id: string) => setExpanded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const render = (nodes: CodeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      const open = expanded.has(n.id) || Boolean(query);
      return (
        <li key={n.id} role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-level={depth + 1} aria-selected={false}>
          <div className={cn("group flex items-center gap-1 border-b py-1.5 pr-2 hover:bg-muted/40", !n.isActive && "opacity-60")} style={{ paddingLeft: depth * 20 + 8 }}>
            {n.children.length ? (
              <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => toggle(n.id)} aria-label={open ? t("admin.collapseAll") : t("admin.expandAll")}>
                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              </button>
            ) : (
              <span className="inline-block w-5" />
            )}
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setEditing({ id: n.id, parentId: null })}>
              <span className={cn("num shrink-0 font-medium", n.level <= 2 && "font-semibold")}>{n.code}</span>
              <span className="truncate text-sm">{locale === "en" && n.nameEn ? n.nameEn : n.name}</span>
              {locale === "en" && n.nameEn ? <span className="hidden truncate text-xs text-muted-foreground lg:inline">{n.name}</span> : null}
            </button>
            <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{n.categoryId ? catLabel.get(n.categoryId) : ""}</span>
            {n.isPostable ? <span className="shrink-0 rounded bg-accent px-1.5 text-[10px] text-accent-foreground">{t("admin.postable").split(" (")[0]}</span> : null}
            {n.usage ? <span className="num shrink-0 text-[11px] text-muted-foreground">{n.usage} {t("admin.lines")}</span> : null}
            {n.effectiveToYear ? <span className="shrink-0 text-[11px] text-muted-foreground">≤{n.effectiveToYear}</span> : null}
            <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`${t("admin.newCode")} (${n.code})`} onClick={() => setEditing({ id: null, parentId: n.id })}>
              <Plus aria-hidden />
            </Button>
          </div>
          {n.children.length && open ? <ul role="group">{render(n.children, depth + 1)}</ul> : null}
        </li>
      );
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <SearchInput label={t("common.search")} />
        <Button variant="outline" size="sm" onClick={() => setExpanded(new Set(allIds))}>
          <ChevronsUpDown aria-hidden />
          {t("admin.expandAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp aria-hidden />
          {t("admin.collapseAll")}
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: null, parentId: null })}>
          <Plus aria-hidden />
          {t("admin.newCode")}
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ul role="tree" aria-label={t("admin.codeTree")} className="text-sm">
          {render(tree, 0)}
        </ul>
        {tree.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p> : null}
      </div>
      {editing ? <CodeDialog kind={kind} editing={editing} flat={flat} categories={categories} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CodeDialog({ kind, editing, flat, categories, onClose }: { kind: "REVENUE" | "EXPENDITURE"; editing: { id: string | null; parentId: string | null }; flat: FlatCode[]; categories: { value: string; label: string }[]; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const current = editing.id ? flat.find((f) => f.id === editing.id) : undefined;
  const parent = flat.find((f) => f.id === (current?.parentId ?? editing.parentId));
  const form = useForm<CodeInput>({
    resolver: zodResolver(codeSchema) as never,
    defaultValues: current
      ? { kind, code: current.code, name: current.name, nameEn: current.nameEn, description: current.description, parentId: current.parentId, categoryId: current.categoryId, isPostable: current.isPostable, isActive: current.isActive, effectiveFromYear: current.effectiveFromYear, effectiveToYear: current.effectiveToYear, sortOrder: current.sortOrder }
      : { kind, code: parent ? parent.code : "", name: "", parentId: parent?.id ?? null, categoryId: parent?.categoryId ?? null, isPostable: true, isActive: true, effectiveFromYear: new Date().getFullYear() + 1, effectiveToYear: null, sortOrder: 0 },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (handleResult(await saveCodeAction(editing.id, values), t("common.saved"))) {
      onClose();
      router.refresh();
    }
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing.id ? `${t("admin.editCode")} ${current?.code}` : t("admin.newCode")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField register={form.register} name="code" label={t("common.code")} required error={e.code?.message} />
              <SelectField control={form.control} name="parentId" label={t("common.parent")} options={flat.filter((f) => f.id !== editing.id).map((f) => ({ value: f.id, label: `${f.code} ${f.name}` }))} allowEmpty />
              <TextField register={form.register} name="name" label={t("admin.officialName")} required error={e.name?.message} className="sm:col-span-2" />
              <TextField register={form.register} name="nameEn" label={t("admin.englishName")} className="sm:col-span-2" />
              <SelectField control={form.control} name="categoryId" label={t("forms.budgetCategory")} options={categories} allowEmpty />
              <TextField register={form.register} name="sortOrder" label={t("common.sortOrder")} type="number" />
              <TextField register={form.register} name="effectiveFromYear" label={t("admin.effectiveFrom")} type="number" required error={e.effectiveFromYear?.message} />
              <TextField register={form.register} name="effectiveToYear" label={t("admin.effectiveTo")} type="number" error={e.effectiveToYear?.message} />
              <TextField register={form.register} name="description" label={t("common.description")} multiline className="sm:col-span-2" />
              <SwitchField control={form.control} name="isPostable" label={t("admin.postable")} />
              <SwitchField control={form.control} name="isActive" label={t("common.active")} />
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

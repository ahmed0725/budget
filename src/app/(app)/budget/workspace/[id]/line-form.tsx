"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { calculateChange, sum, type CategoryDef } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { CodePicker, FormShell, MoneyInput, nextTabHref, toNumber, useFormSave, type CodeOption } from "./form-kit";

export interface LineRow {
  key: string;
  id?: string;
  budgetCodeId: string;
  description: string;
  amount: string;
  priorYearActual: string;
  currentYearEstimate: string;
  justification: string;
}

let seq = 0;
const newKey = () => `new-${Date.now().toString(36)}-${seq++}`;

export function LineForm({
  variant,
  submissionId,
  revision,
  canEdit,
  year,
  baseYear,
  categories,
  codes,
  lines: initialLines,
  notes: initialNotes,
  baselineByCode,
  categoryBaseline,
  noRevenue: initialNoRevenue,
  completion,
}: {
  variant: "C" | "D";
  submissionId: string;
  revision: string;
  canEdit: boolean;
  year: number;
  baseYear: number;
  categories: CategoryDef[];
  codes: CodeOption[];
  lines: LineRow[];
  notes: Record<string, string>;
  baselineByCode: Record<string, number>;
  categoryBaseline: Record<string, number>;
  noRevenue?: boolean;
  completion: number;
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [lines, setLines] = useState<LineRow[]>(initialLines);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [noRevenue, setNoRevenue] = useState(Boolean(initialNoRevenue));
  const [snapshot, setSnapshot] = useState(() => JSON.stringify({ initialLines, initialNotes, n: Boolean(initialNoRevenue) }));
  const dirty = JSON.stringify({ initialLines: lines, initialNotes: notes, n: noRevenue }) !== snapshot;
  const { save, pending } = useFormSave(variant, submissionId, revision);
  const isRevenue = variant === "C";

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);
  const fallbackCategory = categories.find((c) => c.code === "OTHER_RECURRENT")?.id;
  const categoryOf = (line: LineRow) => codeById.get(line.budgetCodeId)?.categoryId ?? (isRevenue ? categories[categories.length - 1]?.id : fallbackCategory) ?? null;
  const used = useMemo(() => new Set(lines.map((l) => l.budgetCodeId).filter(Boolean)), [lines]);

  const update = (key: string, patch: Partial<LineRow>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const add = (categoryId: string) => {
    const first = codes.find((c) => c.categoryId === categoryId && !used.has(c.id));
    setLines((ls) => [...ls, { key: newKey(), budgetCodeId: first?.id ?? "", description: "", amount: "", priorYearActual: "", currentYearEstimate: "", justification: "" }]);
  };

  const onSave = (andContinue: boolean) => {
    const missing = lines.filter((l) => !l.budgetCodeId);
    if (missing.length) {
      toast.error(t("budget.selectCode"));
      return;
    }
    const payload = {
      lines: lines.map((l) => ({
        id: l.id ?? null,
        budgetCodeId: l.budgetCodeId,
        description: l.description || null,
        amount: l.amount === "" ? 0 : l.amount,
        justification: l.justification || null,
        ...(isRevenue ? { priorYearActual: l.priorYearActual === "" ? null : l.priorYearActual, currentYearEstimate: l.currentYearEstimate === "" ? null : l.currentYearEstimate } : {}),
      })),
      categoryNotes: notes,
      ...(isRevenue ? { noRevenue } : {}),
    };
    save(payload, {
      onSaved: () => setSnapshot(JSON.stringify({ initialLines: lines, initialNotes: notes, n: noRevenue })),
      then: andContinue ? () => router.push(nextTabHref(submissionId, variant)) : undefined,
    });
  };

  const grand = sum(lines.map((l) => toNumber(l.amount)));
  const grandBaseline = sum(categories.map((c) => categoryBaseline[c.id] ?? 0));
  const grandChange = calculateChange(grand, grandBaseline);
  const colSpan = isRevenue ? 8 : 6;

  return (
    <FormShell
      form={variant}
      submissionId={submissionId}
      title={t(`forms.${variant}.title`)}
      subtitle={`FOOM ${variant} — ${t(`forms.${variant}.so`).toUpperCase()}`}
      completion={completion}
      canEdit={canEdit}
      dirty={dirty}
      saving={pending}
      onSave={onSave}
    >
      {isRevenue ? (
        <label className="flex w-fit items-center gap-2 text-sm">
          <Checkbox checked={noRevenue} disabled={!canEdit || lines.length > 0} onCheckedChange={(v) => setNoRevenue(Boolean(v))} />
          {t("forms.noRevenue")}
        </label>
      ) : null}
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className={cn("w-full text-sm", isRevenue ? "min-w-[1100px]" : "min-w-[900px]")}>
          <caption className="sr-only">{t(`forms.${variant}.title`)}</caption>
          <thead className="sticky top-0 z-[1] bg-muted/70 text-xs text-muted-foreground backdrop-blur">
            <tr className="border-b">
              <th scope="col" className="w-[30%] px-3 py-2 text-left font-medium">{isRevenue ? t("forms.revenueSource") : t("budget.classification")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.description")}</th>
              {isRevenue ? <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.actualYear", { year: baseYear - 1 })}</th> : null}
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.approvedPrior", { year: baseYear })}</th>
              {isRevenue ? <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.performanceYear", { year: baseYear })}</th> : null}
              <th scope="col" className="px-3 py-2 text-right font-medium">{isRevenue ? t("budget.estimate", { year }) : t("budget.proposal", { year })}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.changePercent")}</th>
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          {categories.map((cat) => {
            const catLines = lines.filter((l) => categoryOf(l) === cat.id);
            const proposed = sum(catLines.map((l) => toNumber(l.amount)));
            const approved = categoryBaseline[cat.id] ?? 0;
            const change = calculateChange(proposed, approved);
            const catCodes = codes.filter((c) => c.categoryId === cat.id);
            return (
              <tbody key={cat.id} className="border-b last:border-0">
                <tr className="bg-accent/30">
                  <th scope="rowgroup" colSpan={isRevenue ? 3 : 2} className="px-3 py-2 text-left">
                    <span className="font-semibold">{locale === "so" ? cat.nameSo : cat.name}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{locale === "so" ? cat.name : cat.nameSo}</span>
                  </th>
                  <td className="num px-3 py-2 text-right font-medium">{fmt.money(approved)}</td>
                  {isRevenue ? <td className="num px-3 py-2 text-right font-medium">{fmt.money(sum(catLines.map((l) => toNumber(l.currentYearEstimate))))}</td> : null}
                  <td className="num px-3 py-2 text-right font-semibold">{fmt.money(proposed)}</td>
                  <td className={cn("num px-3 py-2 text-right font-medium", change.amount < 0 && "text-destructive")}>{fmt.percent(change.percent, 1, { signed: true })}</td>
                  <td />
                </tr>
                {catLines.map((l) => {
                  // No comparable prior-year line (e.g. prior year recorded at a summary code) → "—".
                  const baseline = l.budgetCodeId ? baselineByCode[l.budgetCodeId] : undefined;
                  const lineChange = baseline === undefined ? null : calculateChange(toNumber(l.amount), baseline);
                  return (
                    <tr key={l.key} className="border-t border-dashed">
                      <td className="px-3 py-1.5 pl-6">
                        <CodePicker codes={catCodes} value={l.budgetCodeId} onChange={(id) => update(l.key, { budgetCodeId: id })} disabled={!canEdit} excludeIds={used} invalid={!l.budgetCodeId} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input className="h-8" value={l.description} readOnly={!canEdit} onChange={(e) => update(l.key, { description: e.target.value })} maxLength={300} aria-label={t("common.description")} />
                      </td>
                      {isRevenue ? (
                        <td className="px-3 py-1.5">
                          <MoneyInput value={l.priorYearActual} onValueChange={(v) => update(l.key, { priorYearActual: v })} readOnly={!canEdit} aria-label={t("budget.actualYear", { year: baseYear - 1 })} />
                        </td>
                      ) : null}
                      <td className="num px-3 py-1.5 text-right text-muted-foreground">{baseline === undefined ? "—" : fmt.money(baseline)}</td>
                      {isRevenue ? (
                        <td className="px-3 py-1.5">
                          <MoneyInput value={l.currentYearEstimate} onValueChange={(v) => update(l.key, { currentYearEstimate: v })} readOnly={!canEdit} aria-label={t("budget.performanceYear", { year: baseYear })} />
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5">
                        <MoneyInput value={l.amount} onValueChange={(v) => update(l.key, { amount: v })} readOnly={!canEdit} aria-label={isRevenue ? t("budget.estimate", { year }) : t("budget.proposal", { year })} />
                      </td>
                      <td className="num px-3 py-1.5 text-right text-muted-foreground">{lineChange ? fmt.percent(lineChange.percent, 1, { signed: true }) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        {canEdit ? (
                          <Button variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => remove(l.key)}>
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={colSpan} className="px-3 pt-1 pb-3 pl-6">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                      {canEdit ? (
                        <Button variant="outline" size="sm" onClick={() => add(cat.id)} disabled={catCodes.every((c) => used.has(c.id))}>
                          <Plus aria-hidden />
                          {t("budget.addLine")}
                        </Button>
                      ) : null}
                      <div className="flex-1">
                        <Textarea
                          aria-label={`${isRevenue ? t("budget.explanation") : t("budget.justification")} — ${cat.name}`}
                          placeholder={isRevenue ? t("budget.explanation") : t("budget.justification")}
                          rows={1}
                          className="min-h-8 py-1 text-sm"
                          readOnly={!canEdit}
                          value={notes[cat.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [cat.id]: e.target.value })}
                          maxLength={4000}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            );
          })}
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <th scope="row" colSpan={isRevenue ? 3 : 2} className="px-3 py-2.5 text-left">
                {isRevenue ? t("forms.totalRevenue") : t("forms.totalRecurrent")}
              </th>
              <td className="num px-3 py-2.5 text-right">{fmt.money(grandBaseline)}</td>
              {isRevenue ? <td className="num px-3 py-2.5 text-right">{fmt.money(sum(lines.map((l) => toNumber(l.currentYearEstimate))))}</td> : null}
              <td className="num px-3 py-2.5 text-right">{fmt.money(grand)}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.percent(grandChange.percent, 1, { signed: true })}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </FormShell>
  );
}

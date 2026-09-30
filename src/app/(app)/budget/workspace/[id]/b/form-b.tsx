"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Textarea } from "@/components/ui/textarea";
import type { ComparisonRow } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { FormShell, nextTabHref, useFormSave } from "../form-kit";

export function FormB({
  submissionId,
  revision,
  canEdit,
  year,
  baseYear,
  rows,
  total,
  notes: initialNotes,
}: {
  submissionId: string;
  revision: string;
  canEdit: boolean;
  year: number;
  baseYear: number;
  rows: ComparisonRow[];
  total: ComparisonRow;
  notes: Record<string, string>;
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const dirty = JSON.stringify(notes) !== JSON.stringify(saved);
  const { save, pending } = useFormSave("B", submissionId, revision);

  const onSave = (andContinue: boolean) =>
    save(
      { notes: Object.fromEntries(["PERSONNEL", "GOODS_SERVICES", "CAPITAL", "OTHER", "TOTAL"].map((k) => [k, notes[k] ?? ""])) },
      { onSaved: () => setSaved(notes), then: andContinue ? () => router.push(nextTabHref(submissionId, "B")) : undefined },
    );

  const all = [...rows, total];
  return (
    <FormShell
      form="B"
      submissionId={submissionId}
      title={t("forms.B.title")}
      subtitle={`FOOM B — ${t("forms.B.so").toUpperCase()}`}
      canEdit={canEdit}
      dirty={dirty}
      saving={pending}
      onSave={onSave}
      description={
        <span className="inline-flex items-start gap-1.5">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("forms.formBHint")}
        </span>
      }
    >
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("forms.B.title")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.budgetCategory")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.approvedPrior", { year: baseYear })}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.proposal", { year })}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.change")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("common.changePercent")}</th>
              <th scope="col" className="w-[32%] px-3 py-2 text-left font-medium">{t("budget.explanation")}</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r) => {
              const isTotal = r.key === "TOTAL";
              return (
                <tr key={r.key} className={cn("border-b last:border-0", isTotal && "bg-muted/40 font-semibold")}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {isTotal ? t("budget.totalBudget") : locale === "so" ? r.labelSo : r.label}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">({t("forms.derived")})</span>
                  </th>
                  <td className="num px-3 py-2 text-right">{fmt.money(r.approved)}</td>
                  <td className="num px-3 py-2 text-right">{fmt.money(r.proposed)}</td>
                  <td className={cn("num px-3 py-2 text-right", r.change < 0 && "text-destructive")}>{fmt.money(r.change, { signed: true })}</td>
                  <td className="num px-3 py-2 text-right">{fmt.percent(r.changePercent, 1, { signed: true })}</td>
                  <td className="px-3 py-1.5">
                    <Textarea
                      aria-label={`${t("budget.explanation")} — ${r.label}`}
                      rows={1}
                      className="min-h-8 resize-y py-1 text-sm"
                      readOnly={!canEdit}
                      value={notes[r.key] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.key]: e.target.value })}
                      maxLength={4000}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FormShell>
  );
}

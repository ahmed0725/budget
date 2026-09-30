"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUARTERS, sum } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { FormShell, MoneyInput, nextTabHref, toNumber, useFormSave } from "../form-kit";

interface Row {
  key: string;
  id?: string;
  itemDescription: string;
  estimatedCost: string;
  procurementMethodId: string;
  quarter: string;
  responsibleDepartment: string;
  fundedFrom: string;
  remarks: string;
}
let seq = 0;

export function FormG({
  submissionId,
  revision,
  canEdit,
  completion,
  methods,
  categories,
  projects,
  eligibleTotal,
  rows: initialRows,
  noProcurement: initialNo,
}: {
  submissionId: string;
  revision: string;
  canEdit: boolean;
  completion: number;
  methods: { id: string; name: string; nameEn: string | null }[];
  categories: { id: string; name: string; nameSo: string; eligible: boolean; proposed: number }[];
  projects: { id: string; name: string; allocation: number }[];
  eligibleTotal: number;
  rows: Row[];
  noProcurement: boolean;
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [noProc, setNoProc] = useState(initialNo);
  const [snapshot, setSnapshot] = useState(JSON.stringify({ initialRows, initialNo }));
  const dirty = JSON.stringify({ initialRows: rows, initialNo: noProc }) !== snapshot;
  const { save, pending } = useFormSave("G", submissionId, revision);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = sum(rows.map((r) => toNumber(r.estimatedCost)));
  const within = total <= eligibleTotal;

  const onSave = (andContinue: boolean) => {
    if (rows.some((r) => !r.itemDescription.trim())) {
      toast.error(`${t("forms.procurementItem")} — ${t("common.required")}`);
      return;
    }
    save(
      {
        rows: rows.map((r) => ({
          id: r.id ?? null,
          itemDescription: r.itemDescription,
          estimatedCost: r.estimatedCost,
          procurementMethodId: r.procurementMethodId || null,
          quarter: r.quarter,
          responsibleDepartment: r.responsibleDepartment || null,
          budgetCategoryId: r.fundedFrom.startsWith("category:") ? r.fundedFrom.slice(9) : null,
          capitalProjectId: r.fundedFrom.startsWith("project:") ? r.fundedFrom.slice(8) : null,
          remarks: r.remarks || null,
        })),
        noProcurement: noProc,
      },
      { onSaved: () => setSnapshot(JSON.stringify({ initialRows: rows, initialNo: noProc })), then: andContinue ? () => router.push(nextTabHref(submissionId, "G")) : undefined },
    );
  };

  return (
    <FormShell form="G" submissionId={submissionId} title={t("forms.G.title")} subtitle={`FOOM G — ${t("forms.G.so").toUpperCase()}`} completion={completion} canEdit={canEdit} dirty={dirty} saving={pending} onSave={onSave}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={noProc} disabled={!canEdit || rows.length > 0} onCheckedChange={(v) => setNoProc(Boolean(v))} />
          {t("forms.noProcurement")}
        </label>
        <p className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm", within ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")} role="status">
          {within ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-destructive" aria-hidden />}
          <span className="num">
            {fmt.money(total)} ≤ {fmt.money(eligibleTotal)}
          </span>
          <span className="text-xs text-muted-foreground">(Form G ≤ Agab + Adeeg + Raasamaal)</span>
        </p>
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <caption className="sr-only">{t("forms.G.title")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.procurementItem")}</th>
              <th scope="col" className="w-36 px-3 py-2 text-right font-medium">{t("forms.estimatedCost")}</th>
              <th scope="col" className="w-48 px-3 py-2 text-left font-medium">{t("forms.procurementMethod")}</th>
              <th scope="col" className="w-24 px-3 py-2 text-left font-medium">{t("common.quarter")}</th>
              <th scope="col" className="w-56 px-3 py-2 text-left font-medium">{t("forms.fundedFrom")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.responsibleDepartment")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.remarks")}</th>
              <th scope="col" className="w-10">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="px-3 py-1.5">
                  <Input className="h-8" value={r.itemDescription} readOnly={!canEdit} aria-invalid={!r.itemDescription.trim() || undefined} onChange={(e) => update(r.key, { itemDescription: e.target.value })} aria-label={t("forms.procurementItem")} maxLength={300} />
                </td>
                <td className="px-3 py-1.5">
                  <MoneyInput value={r.estimatedCost} onValueChange={(v) => update(r.key, { estimatedCost: v })} readOnly={!canEdit} aria-label={t("forms.estimatedCost")} invalid={toNumber(r.estimatedCost) <= 0} />
                </td>
                <td className="px-3 py-1.5">
                  <Select value={r.procurementMethodId || undefined} onValueChange={(v) => update(r.key, { procurementMethodId: v })} disabled={!canEdit}>
                    <SelectTrigger className="h-8 w-full" aria-label={t("forms.procurementMethod")} aria-invalid={!r.procurementMethodId || undefined}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {locale === "en" && m.nameEn ? m.nameEn : m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5">
                  <Select value={r.quarter} onValueChange={(v) => update(r.key, { quarter: v })} disabled={!canEdit}>
                    <SelectTrigger className="h-8 w-full" aria-label={t("common.quarter")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5">
                  <Select value={r.fundedFrom || undefined} onValueChange={(v) => update(r.key, { fundedFrom: v })} disabled={!canEdit}>
                    <SelectTrigger className="h-8 w-full" aria-label={t("forms.fundedFrom")}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{t("forms.budgetCategory")}</SelectLabel>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={`category:${c.id}`}>
                            {locale === "so" ? c.nameSo : c.name} ({fmt.compact(c.proposed)})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {projects.length ? (
                        <SelectGroup>
                          <SelectLabel>{t("nav.capitalProjects")}</SelectLabel>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={`project:${p.id}`}>
                              {p.name} ({fmt.compact(p.allocation)})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5">
                  <Input className="h-8" value={r.responsibleDepartment} readOnly={!canEdit} onChange={(e) => update(r.key, { responsibleDepartment: e.target.value })} aria-label={t("forms.responsibleDepartment")} maxLength={150} />
                </td>
                <td className="px-3 py-1.5">
                  <Input className="h-8" value={r.remarks} readOnly={!canEdit} onChange={(e) => update(r.key, { remarks: e.target.value })} aria-label={t("common.remarks")} maxLength={1000} />
                </td>
                <td className="px-2 py-1.5">
                  {canEdit ? (
                    <Button variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <th scope="row" className="px-3 py-2.5 text-left">
                {t("forms.totalProcurement")}
              </th>
              <td className="num px-3 py-2.5 text-right">{fmt.money(total)}</td>
              <td colSpan={6} className="px-3 py-2.5 text-xs font-normal text-muted-foreground">
                {QUARTERS.map((q) => `${q}: ${fmt.compact(sum(rows.filter((r) => r.quarter === q).map((r) => toNumber(r.estimatedCost))))}`).join(" · ")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          disabled={noProc}
          onClick={() => setRows((rs) => [...rs, { key: `new-${seq++}`, itemDescription: "", estimatedCost: "", procurementMethodId: "", quarter: "Q1", responsibleDepartment: "", fundedFrom: "", remarks: "" }])}
        >
          <Plus aria-hidden />
          {t("common.addRow")}
        </Button>
      ) : null}
    </FormShell>
  );
}

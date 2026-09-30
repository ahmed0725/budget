"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sum } from "@/lib/calculations";
import { tDynamic } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { CodePicker, FormShell, MoneyInput, nextTabHref, toNumber, useFormSave, type CodeOption } from "../form-kit";

interface Row {
  key: string;
  lineId?: string;
  projectId?: string | null;
  projectCode: string;
  name: string;
  location: string;
  description: string;
  justification: string;
  budgetCodeId: string;
  totalCost: string;
  spentToDate: string;
  allocation: string;
  priorApproved: number;
  fundingSourceId: string;
  fundingType: string;
  projectType: string;
  isMultiYear: boolean;
  startYear: string;
  expectedCompletionDate: string;
  status: string;
}

const STATUSES = ["PROPOSED", "UNDER_REVIEW", "APPROVED", "ACTIVE", "COMPLETED", "SUSPENDED", "CANCELLED"];
let seq = 0;

export function FormF({
  submissionId,
  revision,
  canEdit,
  year,
  completion,
  codes,
  fundingSources,
  rows: initialRows,
  noCapital: initialNoCapital,
}: {
  submissionId: string;
  revision: string;
  canEdit: boolean;
  year: number;
  completion: number;
  codes: CodeOption[];
  fundingSources: { id: string; name: string; nameEn: string | null }[];
  rows: Row[];
  noCapital: boolean;
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [noCapital, setNoCapital] = useState(initialNoCapital);
  const [snapshot, setSnapshot] = useState(JSON.stringify({ initialRows, initialNoCapital }));
  const dirty = JSON.stringify({ initialRows: rows, initialNoCapital: noCapital }) !== snapshot;
  const { save, pending } = useFormSave("F", submissionId, revision);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onSave = (andContinue: boolean) => {
    const invalid = rows.filter((r) => !r.name.trim() || !r.budgetCodeId);
    if (invalid.length) {
      toast.error(`${t("forms.projectName")} / ${t("budget.classification")} — ${t("common.required")}`);
      return;
    }
    save(
      {
        rows: rows.map((r) => ({
          lineId: r.lineId ?? null,
          projectId: r.projectId ?? null,
          projectCode: r.projectCode,
          name: r.name,
          location: r.location,
          description: r.description,
          justification: r.justification,
          budgetCodeId: r.budgetCodeId,
          totalCost: r.totalCost,
          spentToDate: r.spentToDate,
          allocation: r.allocation,
          fundingSourceId: r.fundingSourceId || null,
          fundingType: r.fundingType,
          projectType: r.projectType,
          isMultiYear: r.isMultiYear,
          startYear: r.startYear,
          expectedCompletionDate: r.expectedCompletionDate || null,
          status: r.status,
        })),
        noCapital,
      },
      { onSaved: () => setSnapshot(JSON.stringify({ initialRows: rows, initialNoCapital: noCapital })), then: andContinue ? () => router.push(nextTabHref(submissionId, "F")) : undefined },
    );
  };

  const addProject = () =>
    setRows((rs) => [
      ...rs,
      {
        key: `new-${seq++}`,
        projectCode: "",
        name: "",
        location: "",
        description: "",
        justification: "",
        budgetCodeId: codes[0]?.id ?? "",
        totalCost: "",
        spentToDate: "0",
        allocation: "",
        priorApproved: 0,
        fundingSourceId: "",
        fundingType: "GOVERNMENT",
        projectType: "NEW",
        isMultiYear: false,
        startYear: String(year),
        expectedCompletionDate: "",
        status: "PROPOSED",
      },
    ]);

  const totalCost = sum(rows.map((r) => toNumber(r.totalCost)));
  const totalAllocation = sum(rows.map((r) => toNumber(r.allocation)));
  const totalPrior = sum(rows.map((r) => r.priorApproved));

  return (
    <FormShell form="F" submissionId={submissionId} title={t("forms.F.title")} subtitle={`FOOM F — ${t("forms.F.so").toUpperCase()}`} completion={completion} canEdit={canEdit} dirty={dirty} saving={pending} onSave={onSave}>
      <label className="flex w-fit items-center gap-2 text-sm">
        <Checkbox checked={noCapital} disabled={!canEdit || rows.length > 0} onCheckedChange={(v) => setNoCapital(Boolean(v))} />
        {t("forms.noCapital")}
      </label>

      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">{t("forms.F.title")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.projectName")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.location")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.totalProjectCost")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("budget.approvedPrior", { year: year - 1 })}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("forms.allocation", { year })}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.fundingSource")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.expectedCompletion")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <a href={`#project-${r.key}`} className="hover:underline">
                    {r.name || "—"}
                  </a>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.location || "—"}</td>
                <td className="num px-3 py-2 text-right">{fmt.money(toNumber(r.totalCost))}</td>
                <td className="num px-3 py-2 text-right text-muted-foreground">{fmt.money(r.priorApproved)}</td>
                <td className="num px-3 py-2 text-right font-medium">{fmt.money(toNumber(r.allocation))}</td>
                <td className="px-3 py-2">{(() => { const f = fundingSources.find((s) => s.id === r.fundingSourceId); return f ? (locale === "en" && f.nameEn ? f.nameEn : f.name) : "—"; })()}</td>
                <td className="px-3 py-2">{r.expectedCompletionDate ? fmt.calendarDate(r.expectedCompletionDate) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <th scope="row" colSpan={2} className="px-3 py-2.5 text-left">
                {t("forms.totalCapital")}
              </th>
              <td className="num px-3 py-2.5 text-right">{fmt.money(totalCost)}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.money(totalPrior)}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.money(totalAllocation)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const overCost = toNumber(r.totalCost) > 0 && toNumber(r.spentToDate) + toNumber(r.allocation) > toNumber(r.totalCost) + 1;
          const id = (f: string) => `f-${r.key}-${f}`;
          return (
            <fieldset key={r.key} id={`project-${r.key}`} className="scroll-mt-20 rounded-lg border bg-card p-4">
              <legend className="px-1 text-sm font-semibold">
                {t("forms.projectName")} {i + 1}
                {r.name ? `: ${r.name}` : ""}
              </legend>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor={id("name")}>
                    {t("forms.projectName")} <span className="text-destructive">*</span>
                  </Label>
                  <Input id={id("name")} className="h-8" value={r.name} readOnly={!canEdit} aria-invalid={!r.name.trim() || undefined} onChange={(e) => update(r.key, { name: e.target.value })} maxLength={250} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id("location")}>{t("forms.location")}</Label>
                  <Input id={id("location")} className="h-8" value={r.location} readOnly={!canEdit} onChange={(e) => update(r.key, { location: e.target.value })} maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label>{t("budget.classification")}</Label>
                  <CodePicker codes={codes} value={r.budgetCodeId} onChange={(v) => update(r.key, { budgetCodeId: v })} disabled={!canEdit} invalid={!r.budgetCodeId} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id("total")}>{t("forms.totalProjectCost")}</Label>
                  <MoneyInput id={id("total")} value={r.totalCost} onValueChange={(v) => update(r.key, { totalCost: v })} readOnly={!canEdit} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id("spent")}>{t("forms.spentToDate")}</Label>
                  <MoneyInput id={id("spent")} value={r.spentToDate} onValueChange={(v) => update(r.key, { spentToDate: v })} readOnly={!canEdit} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id("allocation")}>{t("forms.allocation", { year })}</Label>
                  <MoneyInput id={id("allocation")} value={r.allocation} onValueChange={(v) => update(r.key, { allocation: v })} readOnly={!canEdit} invalid={overCost} />
                </div>
                <div className="space-y-1">
                  <Label>{t("budget.approvedPrior", { year: year - 1 })}</Label>
                  <p className="num flex h-8 items-center justify-end rounded-lg border bg-muted/40 px-2.5 text-muted-foreground">{fmt.money(r.priorApproved)}</p>
                </div>
                <SelectField label={t("forms.fundingSource")} value={r.fundingSourceId} disabled={!canEdit} onChange={(v) => update(r.key, { fundingSourceId: v })} options={fundingSources.map((f) => ({ value: f.id, label: locale === "en" && f.nameEn ? f.nameEn : f.name }))} />
                <SelectField label={t("forms.fundingType")} value={r.fundingType} disabled={!canEdit} onChange={(v) => update(r.key, { fundingType: v })} options={["GOVERNMENT", "DONOR", "MIXED"].map((v) => ({ value: v, label: tDynamic(t, "status", v) }))} />
                <SelectField label={t("forms.projectType")} value={r.projectType} disabled={!canEdit} onChange={(v) => update(r.key, { projectType: v })} options={["NEW", "ONGOING"].map((v) => ({ value: v, label: tDynamic(t, "status", v) }))} />
                <SelectField label={t("forms.projectStatus")} value={r.status} disabled={!canEdit} onChange={(v) => update(r.key, { status: v })} options={STATUSES.map((v) => ({ value: v, label: tDynamic(t, "status", v) }))} />
                <div className="space-y-1">
                  <Label htmlFor={id("start")}>{t("forms.startYear")}</Label>
                  <Input id={id("start")} className="num h-8" inputMode="numeric" value={r.startYear} readOnly={!canEdit} onChange={(e) => update(r.key, { startYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={id("completion")}>{t("forms.expectedCompletion")}</Label>
                  <Input id={id("completion")} type="date" className="h-8" value={r.expectedCompletionDate} readOnly={!canEdit} onChange={(e) => update(r.key, { expectedCompletionDate: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
                  <Checkbox checked={r.isMultiYear} disabled={!canEdit} onCheckedChange={(v) => update(r.key, { isMultiYear: Boolean(v) })} />
                  {t("forms.multiYear")}
                </label>
                <div className="space-y-1 md:col-span-2 xl:col-span-4">
                  <Label htmlFor={id("justification")}>{t("forms.projectJustification")}</Label>
                  <Textarea id={id("justification")} rows={2} value={r.justification} readOnly={!canEdit} onChange={(e) => update(r.key, { justification: e.target.value })} maxLength={4000} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                {overCost ? (
                  <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {t("forms.spentToDate")} + {t("forms.allocation", { year })} &gt; {t("forms.totalProjectCost")}
                  </p>
                ) : (
                  <span />
                )}
                {canEdit ? (
                  <Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <Trash2 aria-hidden />
                    {t("common.remove")}
                  </Button>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </div>
      {canEdit ? (
        <Button variant="outline" size="sm" onClick={addProject} disabled={noCapital}>
          <Plus aria-hidden />
          {t("common.add")} — {t("forms.projectName")}
        </Button>
      ) : null}
    </FormShell>
  );
}

function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-full" aria-label={label}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

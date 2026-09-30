"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Play, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Field } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { deleteSavedReportAction, saveReportAction } from "./actions";

interface Option {
  value: string;
  label: string;
}
export interface BuilderState {
  source: "budget" | "execution";
  year: number;
  dataset: "effective" | "approved";
  kind: "EXPENDITURE" | "REVENUE" | "ALL";
  sectorId: string | null;
  mdaId: string | null;
  categoryId: string | null;
  codePrefix: string | null;
  groupBy: string[];
  measures: string[];
  sortBy: string;
  sortDir: "asc" | "desc";
  limit: number | null;
}

const NONE = "__none__";

function Pick({ id, value, onChange, options, allowNone, noneLabel }: { id: string; value: string | null; onChange: (v: string | null) => void; options: Option[]; allowNone?: boolean; noneLabel?: string }) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className="h-8 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{noneLabel ?? "—"}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function encode(s: BuilderState) {
  const clean = { ...s, sectorId: s.sectorId || null, mdaId: s.mdaId || null, categoryId: s.categoryId || null, codePrefix: s.codePrefix || null, limit: s.limit || null };
  return btoa(unescape(encodeURIComponent(JSON.stringify(clean)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function BuilderForm({
  initial,
  options,
  labels,
  saved,
  canSave,
  canExecution,
}: {
  initial: BuilderState;
  options: { years: Option[]; sectors: Option[]; mdas: Option[]; categories: Option[]; dimensions: Option[]; budgetMeasures: Option[]; executionMeasures: Option[] };
  labels: Record<string, string>;
  saved: { id: string; name: string; description: string | null; isShared: boolean; owned: boolean } | null;
  canSave: boolean;
  canExecution: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [s, setS] = useState<BuilderState>(initial);
  const [pending, start] = useTransition();
  const measures = s.source === "budget" ? options.budgetMeasures : options.executionMeasures;
  const set = (patch: Partial<BuilderState>) => setS((cur) => ({ ...cur, ...patch }));
  const run = () => start(() => router.push(`/reports/custom?config=${encode(s)}${saved ? `&saved=${saved.id}` : ""}`));
  const sortOptions: Option[] = [...s.groupBy.map((g) => ({ value: g, label: options.dimensions.find((d) => d.value === g)?.label ?? g })), ...measures.filter((m) => s.measures.includes(m.value))];

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-label={labels.builder}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="b-source" label={labels.source}>
          <Pick
            id="b-source"
            value={s.source}
            onChange={(v) => set({ source: (v as BuilderState["source"]) ?? "budget", measures: v === "execution" ? ["budget", "actual", "rate"] : ["amount", "share"], sortBy: v === "execution" ? "budget" : "amount" })}
            options={[{ value: "budget", label: labels.sourceBudget }, ...(canExecution ? [{ value: "execution", label: labels.sourceExecution }] : [])]}
          />
        </Field>
        <Field id="b-year" label={t("common.year")}>
          <Pick id="b-year" value={String(s.year)} onChange={(v) => set({ year: Number(v) })} options={options.years} />
        </Field>
        <Field id="b-kind" label={t("common.type")}>
          <Pick
            id="b-kind"
            value={s.kind}
            onChange={(v) => set({ kind: (v as BuilderState["kind"]) ?? "EXPENDITURE" })}
            options={[
              { value: "EXPENDITURE", label: t("budget.expenditureKind") },
              { value: "REVENUE", label: t("budget.revenueKind") },
              { value: "ALL", label: t("common.all") },
            ]}
          />
        </Field>
        {s.source === "budget" ? (
          <Field id="b-dataset" label={t("analysis.dataset")}>
            <Pick
              id="b-dataset"
              value={s.dataset}
              onChange={(v) => set({ dataset: (v as BuilderState["dataset"]) ?? "effective" })}
              options={[
                { value: "effective", label: t("analysis.includeProposals") },
                { value: "approved", label: t("analysis.approvedOnly") },
              ]}
            />
          </Field>
        ) : (
          <span />
        )}
        <Field id="b-sector" label={t("common.sector")}>
          <Pick id="b-sector" value={s.sectorId} onChange={(v) => set({ sectorId: v })} options={options.sectors} allowNone noneLabel={t("common.all")} />
        </Field>
        <Field id="b-mda" label={t("common.mda")}>
          <Pick id="b-mda" value={s.mdaId} onChange={(v) => set({ mdaId: v })} options={options.mdas} allowNone noneLabel={t("common.all")} />
        </Field>
        <Field id="b-cat" label={t("common.category")}>
          <Pick id="b-cat" value={s.categoryId} onChange={(v) => set({ categoryId: v })} options={options.categories} allowNone noneLabel={t("common.all")} />
        </Field>
        <Field id="b-code" label={labels.codePrefix} hint="e.g. 22">
          <Input id="b-code" className="h-8" inputMode="numeric" value={s.codePrefix ?? ""} onChange={(e) => set({ codePrefix: e.target.value.replace(/\D/g, "") || null })} />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">{labels.grouping}</legend>
          {[0, 1, 2].map((i) => (
            <Field key={i} id={`b-g${i}`} label={`${labels.level} ${i + 1}`}>
              <Pick
                id={`b-g${i}`}
                value={s.groupBy[i] ?? null}
                allowNone={i > 0}
                noneLabel="—"
                onChange={(v) => {
                  const next = [...s.groupBy];
                  if (v) next[i] = v;
                  else next.splice(i);
                  set({ groupBy: [...new Set(next.filter(Boolean))] });
                }}
                options={options.dimensions.filter((d) => d.value === s.groupBy[i] || !s.groupBy.includes(d.value))}
              />
            </Field>
          ))}
        </fieldset>
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">{labels.columns}</legend>
          {measures.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={s.measures.includes(m.value)} onCheckedChange={(c) => set({ measures: c ? [...s.measures, m.value] : s.measures.filter((x) => x !== m.value) })} />
              {m.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">{labels.sorting}</legend>
          <Field id="b-sort" label={labels.sortBy}>
            <Pick id="b-sort" value={sortOptions.some((o) => o.value === s.sortBy) ? s.sortBy : null} onChange={(v) => set({ sortBy: v ?? s.sortBy })} options={sortOptions} />
          </Field>
          <Field id="b-dir" label={labels.direction}>
            <Pick
              id="b-dir"
              value={s.sortDir}
              onChange={(v) => set({ sortDir: (v as "asc" | "desc") ?? "desc" })}
              options={[
                { value: "desc", label: labels.descending },
                { value: "asc", label: labels.ascending },
              ]}
            />
          </Field>
          <Field id="b-limit" label={labels.limit} hint={t("common.optional")}>
            <Input id="b-limit" className="h-8" type="number" min={1} max={5000} value={s.limit ?? ""} onChange={(e) => set({ limit: e.target.value ? Math.min(5000, Math.max(1, Number(e.target.value))) : null })} />
          </Field>
        </fieldset>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {saved?.owned ? (
          <ConfirmDialog
            destructive
            trigger={
              <Button variant="outline" size="sm">
                <Trash2 aria-hidden />
                {t("common.delete")}
              </Button>
            }
            title={t("common.delete")}
            description={saved.name}
            onConfirm={async () => {
              if (handleResult(await deleteSavedReportAction(saved.id), t("common.saved"))) router.push("/reports/custom");
            }}
          />
        ) : null}
        {canSave ? <SaveDialog state={s} saved={saved} labels={labels} /> : null}
        <Button size="sm" onClick={run} disabled={pending || s.groupBy.length === 0 || s.measures.length === 0}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {t("reports.run")}
        </Button>
      </div>
    </section>
  );
}

function SaveDialog({ state, saved, labels }: { state: BuilderState; saved: { id: string; name: string; description: string | null; isShared: boolean; owned: boolean } | null; labels: Record<string, string> }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: saved?.name ?? "", description: saved?.description ?? "", isShared: saved?.isShared ?? false, asNew: !saved?.owned });
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save aria-hidden />
          {t("reports.saveReport")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reports.saveReport")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field id="sr-name" label={t("common.name")} required>
            <Input id="sr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field id="sr-desc" label={t("common.description")}>
            <Textarea id="sr-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.isShared} onCheckedChange={(c) => setForm({ ...form, isShared: c })} />
            {t("reports.shared")}
          </label>
          {saved?.owned ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.asNew} onCheckedChange={(c) => setForm({ ...form, asNew: c === true })} />
              {labels.saveAsNew}
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || form.name.trim().length < 3}
            onClick={() =>
              start(async () => {
                const res = handleResult(await saveReportAction({ id: saved?.owned && !form.asNew ? saved.id : null, name: form.name, description: form.description, isShared: form.isShared, config: { ...state, sectorId: state.sectorId || null, mdaId: state.mdaId || null, categoryId: state.categoryId || null, codePrefix: state.codePrefix || null, limit: state.limit || null } }));
                if (res) {
                  setOpen(false);
                  router.push(`/reports/custom?saved=${res.id}`);
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

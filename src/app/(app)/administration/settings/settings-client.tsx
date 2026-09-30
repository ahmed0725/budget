"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { Field } from "@/components/app/form-fields";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { saveCategoryAction, saveLookupAction, saveRuleAction, saveSettingAction } from "../actions";

type Scalar = string | number | boolean | string[];

export interface SettingField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "multi";
  options?: { value: string; label: string }[];
  hint?: string;
  wide?: boolean;
}

/**
 * Edits one settings key. `value` is either an object (edited field by field) or a
 * scalar (edited with a single field whose key is "value").
 */
export function SettingForm({ settingKey, title, description, fields, value }: { settingKey: string; title: string; description?: string; fields: SettingField[]; value: Record<string, Scalar> | Scalar }) {
  const { t } = useT();
  const router = useRouter();
  const scalar = typeof value !== "object" || Array.isArray(value);
  const [state, setState] = useState<Record<string, Scalar>>(scalar ? { value: value as Scalar } : (value as Record<string, Scalar>));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const initial = JSON.stringify(scalar ? { value } : value);
  const dirty = JSON.stringify(state) !== initial;
  const save = () =>
    start(async () => {
      const res = await saveSettingAction(settingKey, scalar ? state.value : state);
      setErrors(res.ok ? {} : (res.error.fieldErrors ?? {}));
      if (handleResult(res, t("common.saved"))) router.refresh();
    });
  const id = (k: string) => `s-${settingKey}-${k}`;
  return (
    <section className="rounded-lg border bg-card" aria-labelledby={`${settingKey}-title`}>
      <div className="border-b px-4 py-3">
        <h2 id={`${settingKey}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {fields.map((f) => {
          const v = state[f.key];
          const err = errors[f.key]?.[0] ?? (scalar ? errors[""]?.[0] : undefined);
          if (f.type === "boolean") {
            return (
              <label key={f.key} className="flex items-start gap-3 rounded-md border p-3 text-sm sm:col-span-2">
                <Switch checked={Boolean(v)} onCheckedChange={(c) => setState({ ...state, [f.key]: c })} />
                <span>
                  {f.label}
                  {f.hint ? <span className="block text-xs text-muted-foreground">{f.hint}</span> : null}
                </span>
              </label>
            );
          }
          if (f.type === "multi") {
            const list = (v as string[]) ?? [];
            return (
              <Field key={f.key} label={f.label} error={err} hint={f.hint} className="sm:col-span-2">
                <div className="flex flex-wrap gap-3">
                  {f.options!.map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={list.includes(o.value)} onCheckedChange={(c) => setState({ ...state, [f.key]: c ? [...list, o.value] : list.filter((x) => x !== o.value) })} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </Field>
            );
          }
          if (f.type === "select") {
            return (
              <Field key={f.key} id={id(f.key)} label={f.label} error={err} hint={f.hint} className={f.wide ? "sm:col-span-2" : undefined}>
                <Select value={String(v)} onValueChange={(nv) => setState({ ...state, [f.key]: nv })}>
                  <SelectTrigger id={id(f.key)} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options!.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            );
          }
          return (
            <Field key={f.key} id={id(f.key)} label={f.label} error={err} hint={f.hint} className={f.wide ? "sm:col-span-2" : undefined}>
              <Input
                id={id(f.key)}
                type={f.type === "number" ? "number" : "text"}
                value={String(v ?? "")}
                aria-invalid={Boolean(err)}
                onChange={(e) => setState({ ...state, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
              />
            </Field>
          );
        })}
      </div>
      <div className="flex justify-end border-t px-4 py-3">
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("common.save")}
        </Button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup lists
// ─────────────────────────────────────────────────────────────────────────────

type LookupCategory = "AGENCY_TYPE" | "REGION" | "MDA_CATEGORY" | "FUNDING_SOURCE" | "PROCUREMENT_METHOD";
interface LookupRow {
  id: string;
  category: LookupCategory;
  code: string;
  name: string;
  nameEn: string | null;
  sortOrder: number;
  isActive: boolean;
}

export function LookupsEditor({ category, categories, rows }: { category: LookupCategory; categories: { value: string; label: string }[]; rows: LookupRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const empty: Omit<LookupRow, "id"> = { category, code: "", name: "", nameEn: "", sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1, isActive: true };
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="lookups-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="lookups-title" className="text-sm font-semibold">
          {t("admin.lookups")}
        </h2>
        <Select value={category} onValueChange={(v) => router.push(`/administration/settings?tab=lookups&list=${v}`)}>
          <SelectTrigger className="w-64" aria-label={t("admin.lookupCategory")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-40 px-3 py-2 text-left font-medium">{t("common.code")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("admin.officialName")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("admin.englishName")}</th>
              <th scope="col" className="w-24 px-3 py-2 text-left font-medium">{t("common.sortOrder")}</th>
              <th scope="col" className="w-20 px-3 py-2 text-left font-medium">{t("common.active")}</th>
              <th scope="col" className="w-24 px-3 py-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <LookupRowEditor key={r.id} row={r} />
            ))}
            <LookupRowEditor key={`new-${category}-${rows.length}`} row={{ ...empty, id: "" }} isNew />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LookupRowEditor({ row, isNew }: { row: LookupRow; isNew?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [s, setS] = useState(row);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(row);
  const save = () =>
    start(async () => {
      const { id, ...input } = s;
      if (handleResult(await saveLookupAction(isNew ? null : id, input), t("common.saved"))) router.refresh();
    });
  const cell = "px-2 py-1.5";
  return (
    <tr className="border-b last:border-0">
      <td className={cell}>
        <Input className="h-8 font-mono" value={s.code} aria-label={t("common.code")} placeholder={isNew ? t("common.addRow") : undefined} onChange={(e) => setS({ ...s, code: e.target.value.toUpperCase() })} />
      </td>
      <td className={cell}>
        <Input className="h-8" value={s.name} aria-label={t("admin.officialName")} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </td>
      <td className={cell}>
        <Input className="h-8" value={s.nameEn ?? ""} aria-label={t("admin.englishName")} onChange={(e) => setS({ ...s, nameEn: e.target.value })} />
      </td>
      <td className={cell}>
        <Input className="h-8" type="number" value={s.sortOrder} aria-label={t("common.sortOrder")} onChange={(e) => setS({ ...s, sortOrder: Number(e.target.value) })} />
      </td>
      <td className={cell}>
        <Switch checked={s.isActive} aria-label={t("common.active")} onCheckedChange={(c) => setS({ ...s, isActive: c })} />
      </td>
      <td className={`${cell} text-right`}>
        <Button size="sm" variant={isNew ? "default" : "outline"} disabled={!dirty || pending || !s.code || !s.name} onClick={save}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : isNew ? <Plus aria-hidden /> : <Save aria-hidden />}
          {isNew ? t("common.add") : t("common.save")}
        </Button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation rules
// ─────────────────────────────────────────────────────────────────────────────

interface RuleRow {
  code: string;
  name: string;
  description: string;
  form: string;
  severity: "ERROR" | "WARNING" | "INFO";
  isActive: boolean;
  tolerance: number;
  thresholdPercent: number | null;
}

export function RulesEditor({ rows, canEdit }: { rows: RuleRow[]; canEdit: boolean }) {
  const { t } = useT();
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="rules-title">
      <div className="border-b px-4 py-3">
        <h2 id="rules-title" className="text-sm font-semibold">
          {t("admin.validationRules")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("validation.rulesHint")}</p>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("validation.rule")}</th>
              <th scope="col" className="w-16 px-3 py-2 text-left font-medium">{t("validation.form")}</th>
              <th scope="col" className="w-36 px-3 py-2 text-left font-medium">{t("admin.severity")}</th>
              <th scope="col" className="w-28 px-3 py-2 text-left font-medium">{t("admin.tolerance")}</th>
              <th scope="col" className="w-28 px-3 py-2 text-left font-medium">{t("admin.threshold")}</th>
              <th scope="col" className="w-20 px-3 py-2 text-left font-medium">{t("common.active")}</th>
              <th scope="col" className="w-24 px-3 py-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RuleRowEditor key={r.code} row={r} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RuleRowEditor({ row, canEdit }: { row: RuleRow; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [s, setS] = useState(row);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(row);
  const cell = "px-2 py-1.5 align-top";
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-muted-foreground">{row.description}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{row.code}</div>
      </td>
      <td className="px-3 py-2">{row.form}</td>
      <td className={cell}>
        <Select value={s.severity} onValueChange={(v) => setS({ ...s, severity: v as RuleRow["severity"] })} disabled={!canEdit}>
          <SelectTrigger className="h-8 w-full" aria-label={t("admin.severity")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["ERROR", "WARNING", "INFO"] as const).map((sv) => (
              <SelectItem key={sv} value={sv}>
                {t(`status.${sv}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className={cell}>
        <Input className="h-8" type="number" step="0.01" min={0} value={s.tolerance} disabled={!canEdit} aria-label={t("admin.tolerance")} onChange={(e) => setS({ ...s, tolerance: Number(e.target.value) })} />
      </td>
      <td className={cell}>
        {row.thresholdPercent !== null ? (
          <Input className="h-8" type="number" min={0} value={s.thresholdPercent ?? ""} disabled={!canEdit} aria-label={t("admin.threshold")} onChange={(e) => setS({ ...s, thresholdPercent: e.target.value === "" ? null : Number(e.target.value) })} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={cell}>
        <Switch checked={s.isActive} disabled={!canEdit} aria-label={t("common.active")} onCheckedChange={(c) => setS({ ...s, isActive: c })} />
      </td>
      <td className={`${cell} text-right`}>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() =>
              start(async () => {
                if (handleResult(await saveRuleAction({ code: s.code, severity: s.severity, isActive: s.isActive, tolerance: s.tolerance, thresholdPercent: row.thresholdPercent !== null ? s.thresholdPercent : undefined }), t("common.saved"))) router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t("common.save")}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget categories
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  code: string;
  kind: string;
  summaryGroup: string | null;
  isCapital: boolean;
  name: string;
  nameSo: string;
  procurementEligible: boolean;
  isActive: boolean;
  sortOrder: number;
  codes: number;
}

export function CategoriesEditor({ rows, canEdit }: { rows: CategoryRow[]; canEdit: boolean }) {
  const { t } = useT();
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="cat-title">
      <div className="border-b px-4 py-3">
        <h2 id="cat-title" className="text-sm font-semibold">
          {t("admin.categories")}
        </h2>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.code")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.name")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.somali")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("admin.procurementEligible")}</th>
              <th scope="col" className="w-24 px-3 py-2 text-left font-medium">{t("common.sortOrder")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.active")}</th>
              <th scope="col" className="w-24 px-3 py-2">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CategoryRowEditor key={r.id} row={r} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryRowEditor({ row, canEdit }: { row: CategoryRow; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [s, setS] = useState(row);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(row);
  const cell = "px-2 py-1.5";
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-mono text-xs">{row.code}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          <StatusBadge status="INFO" label={row.kind === "REVENUE" ? t("budget.revenueKind") : t("budget.expenditureKind")} />
          <span className="text-[11px] text-muted-foreground">
            {row.codes} {t("admin.codesCount")}
          </span>
        </div>
      </td>
      <td className={cell}>
        <Input className="h-8" value={s.name} disabled={!canEdit} aria-label={t("common.name")} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </td>
      <td className={cell}>
        <Input className="h-8" value={s.nameSo} disabled={!canEdit} aria-label={t("common.somali")} onChange={(e) => setS({ ...s, nameSo: e.target.value })} />
      </td>
      <td className={cell}>
        <Switch checked={s.procurementEligible} disabled={!canEdit || row.kind === "REVENUE"} aria-label={t("admin.procurementEligible")} onCheckedChange={(c) => setS({ ...s, procurementEligible: c })} />
      </td>
      <td className={cell}>
        <Input className="h-8" type="number" value={s.sortOrder} disabled={!canEdit} aria-label={t("common.sortOrder")} onChange={(e) => setS({ ...s, sortOrder: Number(e.target.value) })} />
      </td>
      <td className={cell}>
        <Switch checked={s.isActive} disabled={!canEdit} aria-label={t("common.active")} onCheckedChange={(c) => setS({ ...s, isActive: c })} />
      </td>
      <td className={`${cell} text-right`}>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() =>
              start(async () => {
                if (handleResult(await saveCategoryAction({ id: s.id, name: s.name, nameSo: s.nameSo, procurementEligible: s.procurementEligible, isActive: s.isActive, sortOrder: s.sortOrder }), t("common.saved"))) router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t("common.save")}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

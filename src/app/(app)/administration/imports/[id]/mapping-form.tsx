"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { Field } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { mapAndValidateAction } from "../actions";

const NONE = "__none__";

interface TableColumn {
  col: string;
  header: string;
  samples: string[];
}
export interface DetectedTable {
  sheet: string;
  headerRow: number;
  columns: TableColumn[];
  dataRows: number;
}
export interface DetectedSheet {
  name: string;
  role: string;
  confidence: number;
  rowCount: number;
  notes: string[];
  years: number[];
}
interface Option {
  value: string;
  label: string;
}

type Opts = Record<string, unknown>;

export function MappingForm({
  importId,
  profileKey,
  fields,
  tables,
  suggestions,
  sheets,
  initial,
  years,
  mdas,
}: {
  importId: string;
  profileKey: string;
  fields: { key: string; label: string; required: boolean }[] | null;
  tables: DetectedTable[];
  suggestions: Record<string, Record<string, string>>;
  sheets: DetectedSheet[];
  initial: Opts;
  years: number[];
  mdas: Option[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [opts, setOpts] = useState<Opts>(initial);
  const [pending, start] = useTransition();
  const set = (patch: Opts) => setOpts({ ...opts, ...patch });
  const validate = () =>
    start(async () => {
      const res = handleResult(await mapAndValidateAction(importId, opts));
      if (res) router.refresh();
    });

  return (
    <div className="space-y-4">
      {fields ? (
        <TableMapping fields={fields} tables={tables} suggestions={suggestions} opts={opts} set={set} years={years} mdas={mdas} profileKey={profileKey} />
      ) : (
        <WorkbookMapping sheets={sheets} opts={opts} set={set} mdas={mdas} />
      )}
      <div className="flex justify-end">
        <Button onClick={validate} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ScanSearch aria-hidden />}
          {t("imports.validateNow")}
        </Button>
      </div>
    </div>
  );
}

function SimpleSelect({ id, value, onChange, options, label }: { id?: string; value: string; onChange: (v: string) => void; options: Option[]; label?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-8 w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TableMapping({
  fields,
  tables,
  suggestions,
  opts,
  set,
  years,
  mdas,
  profileKey,
}: {
  fields: { key: string; label: string; required: boolean }[];
  tables: DetectedTable[];
  suggestions: Record<string, Record<string, string>>;
  opts: Opts;
  set: (p: Opts) => void;
  years: number[];
  mdas: Option[];
  profileKey: string;
}) {
  const { t } = useT();
  const sheet = String(opts.sheet ?? "");
  const table = tables.find((x) => x.sheet === sheet) ?? tables[0];
  const columns = (opts.columns ?? {}) as Record<string, string>;
  const colOptions: Option[] = [{ value: NONE, label: t("imports.notMapped") }, ...(table?.columns ?? []).map((c) => ({ value: c.col, label: `${c.col} — ${c.header}` }))];
  const samplesOf = (col: string) => table?.columns.find((c) => c.col === col)?.samples.join(" · ") ?? "";
  const hasFixed = (key: string) => key === "year" || key === "mdaCode";
  const fixedValue = (key: string) => (key === "year" ? (opts.year as number | null) : (opts.mdaCode as string | null));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="map-sheet" label={t("imports.sheet")}>
          <SimpleSelect
            id="map-sheet"
            value={table?.sheet ?? ""}
            onChange={(v) => {
              const tb = tables.find((x) => x.sheet === v);
              set({ sheet: v, headerRow: tb?.headerRow ?? 1, columns: suggestions[v] ?? {} });
            }}
            options={tables.map((x) => ({ value: x.sheet, label: `${x.sheet} (${x.dataRows})` }))}
          />
        </Field>
        <Field id="map-header" label={t("imports.headerRow")}>
          <Input id="map-header" className="h-8" type="number" min={1} value={Number(opts.headerRow ?? 1)} onChange={(e) => set({ headerRow: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        {profileKey === "budget-lines" ? (
          <Field id="map-target" label={t("imports.target")}>
            <SimpleSelect
              id="map-target"
              value={String(opts.target ?? "DRAFT")}
              onChange={(v) => set({ target: v })}
              options={[
                { value: "DRAFT", label: t("imports.targetDraft") },
                { value: "APPROVED", label: t("imports.targetApproved") },
              ]}
            />
          </Field>
        ) : null}
        {profileKey.startsWith("execution-") ? (
          <Field id="map-mode" label={t("imports.mode")}>
            <SimpleSelect
              id="map-mode"
              value={String(opts.mode ?? "REPLACE")}
              onChange={(v) => set({ mode: v })}
              options={[
                { value: "REPLACE", label: t("imports.modeReplace") },
                { value: "ADD", label: t("imports.modeAdd") },
              ]}
            />
          </Field>
        ) : null}
        {profileKey === "chart-of-accounts" ? (
          <>
            <Field id="map-kind" label={t("imports.codeKind")}>
              <SimpleSelect
                id="map-kind"
                value={String(opts.kind ?? NONE)}
                onChange={(v) => set({ kind: v === NONE ? null : v })}
                options={[
                  { value: NONE, label: t("imports.autoDetect") },
                  { value: "REVENUE", label: t("budget.revenueKind") },
                  { value: "EXPENDITURE", label: t("budget.expenditureKind") },
                ]}
              />
            </Field>
            <Field id="map-eff" label={t("imports.effectiveFromYear")}>
              <Input id="map-eff" className="h-8" type="number" value={Number(opts.effectiveFromYear ?? new Date().getFullYear())} onChange={(e) => set({ effectiveFromYear: Number(e.target.value) })} />
            </Field>
          </>
        ) : null}
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-56 px-3 py-2 text-left font-medium">{t("imports.field")}</th>
              <th scope="col" className="w-72 px-3 py-2 text-left font-medium">{t("imports.column")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.examples")}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const fixed = hasFixed(f.key) ? fixedValue(f.key) : null;
              const col = columns[f.key] || "";
              return (
                <tr key={f.key} className="border-b last:border-0 align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {f.label}
                    {f.required || hasFixed(f.key) ? <span className="text-destructive"> *</span> : null}
                  </th>
                  <td className="space-y-1.5 px-3 py-1.5">
                    {fixed === null || fixed === undefined ? <SimpleSelect label={f.label} value={col || NONE} onChange={(v) => set({ columns: { ...columns, [f.key]: v === NONE ? "" : v } })} options={colOptions} /> : null}
                    {f.key === "year" ? (
                      <SimpleSelect
                        label={t("imports.fixedYear")}
                        value={fixed === null || fixed === undefined ? NONE : String(fixed)}
                        onChange={(v) => set({ year: v === NONE ? null : Number(v), columns: { ...columns, year: v === NONE ? columns.year : "" } })}
                        options={[{ value: NONE, label: t("imports.fromColumn") }, ...years.map((y) => ({ value: String(y), label: `${t("imports.fixedYear")}: ${y}` }))]}
                      />
                    ) : null}
                    {f.key === "mdaCode" ? (
                      <SimpleSelect
                        label={t("imports.fixedMda")}
                        value={fixed === null || fixed === undefined ? NONE : String(fixed)}
                        onChange={(v) => set({ mdaCode: v === NONE ? null : v, columns: { ...columns, mdaCode: v === NONE ? columns.mdaCode : "" } })}
                        options={[{ value: NONE, label: t("imports.fromColumn") }, ...mdas]}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{col ? samplesOf(col) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {profileKey === "budget-lines" ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={Boolean(opts.createMissingCodes)} onCheckedChange={(c) => set({ createMissingCodes: c })} />
          {t("imports.createMissingCodes")}
        </label>
      ) : null}
    </div>
  );
}

const ROLES = ["REVENUE_DETAIL", "SUMMARY", "MDA_SUMMARY", "MDA_DETAIL", "IGNORE"] as const;
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  REVENUE_DETAIL: "Revenue detail (by code, per year)",
  SUMMARY: "Revenue & expenditure summary (reconciliation)",
  MDA_SUMMARY: "MDA summary (one row per MDA)",
  MDA_DETAIL: "MDA detail blocks",
  IGNORE: "Ignore",
};

function WorkbookMapping({ sheets, opts, set, mdas }: { sheets: DetectedSheet[]; opts: Opts; set: (p: Opts) => void; mdas: Option[] }) {
  const { t } = useT();
  const roles = (opts.sheets ?? []) as { name: string; role: string }[];
  const years = (opts.years ?? []) as { year: number; target: string }[];
  const columnCodes = (opts.columnCodes ?? {}) as Record<string, string>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.sheet")}</th>
              <th scope="col" className="w-72 px-3 py-2 text-left font-medium">{t("imports.sheetRole")}</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => {
              const d = sheets.find((s) => s.name === r.name);
              return (
                <tr key={r.name} className="border-b last:border-0 align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {r.name}
                    <div className="text-xs font-normal text-muted-foreground">
                      {d ? `${d.rowCount} rows${d.years.length ? ` · ${d.years.join(", ")}` : ""}${d.notes.length ? ` · ${d.notes.join("; ")}` : ""}` : ""}
                    </div>
                  </th>
                  <td className="px-3 py-1.5">
                    <SimpleSelect label={r.name} value={r.role} onChange={(v) => set({ sheets: roles.map((x, j) => (j === i ? { ...x, role: v } : x)) })} options={ROLES.map((x) => ({ value: x, label: ROLE_LABEL[x] }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-4">
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">{t("imports.yearsToImport")}</th>
                <th scope="col" className="w-64 px-3 py-2 text-left font-medium">{t("imports.target")}</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => (
                <tr key={y.year} className="border-b last:border-0">
                  <th scope="row" className="num px-3 py-2 text-left font-medium">
                    {y.year}
                  </th>
                  <td className="px-3 py-1.5">
                    <SimpleSelect
                      label={String(y.year)}
                      value={y.target}
                      onChange={(v) => set({ years: years.map((x, j) => (j === i ? { ...x, target: v } : x)) })}
                      options={[
                        { value: "APPROVED", label: t("imports.targetApproved") },
                        { value: "DRAFT", label: t("imports.targetDraft") },
                        { value: "SKIP", label: t("imports.targetSkip") },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Field id="wb-rev" label={t("imports.revenueMda")}>
          <SimpleSelect id="wb-rev" value={String(opts.revenueMdaCode ?? "")} onChange={(v) => set({ revenueMdaCode: v })} options={mdas} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={Boolean(opts.createMissingCodes)} onCheckedChange={(c) => set({ createMissingCodes: c })} />
          {t("imports.createMissingCodes")}
        </label>
        {Object.keys(columnCodes).length ? (
          <details className="rounded-lg border bg-card p-3 text-xs">
            <summary className="cursor-pointer text-sm font-medium">
              {t("imports.columnCodes")} ({Object.keys(columnCodes).length})
            </summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {Object.entries(columnCodes).map(([col, code]) => (
                <li key={col} className="num">
                  {col} → {code}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

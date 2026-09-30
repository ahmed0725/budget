"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculatePersonnelCost, sum, withinTolerance } from "@/lib/calculations";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { FormShell, MoneyInput, nextTabHref, toNumber, useFormSave } from "../form-kit";

interface Row {
  key: string;
  id?: string;
  positionTitle: string;
  grade: string;
  department: string;
  approvedEstablishment: string;
  filledPositions: string;
  monthlyCost: string;
  remarks: string;
}

let seq = 0;

export function FormE({
  submissionId,
  revision,
  canEdit,
  completion,
  rows: initialRows,
  formDPersonnel,
  hrCertification,
}: {
  submissionId: string;
  revision: string;
  canEdit: boolean;
  completion: number;
  rows: Row[];
  formDPersonnel: number;
  hrCertification: { name: string; at: string } | null;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [snapshot, setSnapshot] = useState(JSON.stringify(initialRows));
  const dirty = JSON.stringify(rows) !== snapshot;
  const { save, pending } = useFormSave("E", submissionId, revision);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.positionTitle.trim().toLowerCase()}|${r.grade.trim().toLowerCase()}`;
      if (r.positionTitle.trim()) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const annual = (r: Row) => calculatePersonnelCost(toNumber(r.filledPositions), toNumber(r.monthlyCost));
  const totalAnnual = sum(rows.map(annual));
  const matches = withinTolerance(totalAnnual, formDPersonnel, 1);

  const onSave = (andContinue: boolean) =>
    save(
      {
        rows: rows.map((r) => ({
          id: r.id ?? null,
          positionTitle: r.positionTitle,
          grade: r.grade || null,
          department: r.department || null,
          approvedEstablishment: r.approvedEstablishment,
          filledPositions: r.filledPositions,
          monthlyCost: r.monthlyCost,
          remarks: r.remarks || null,
        })),
      },
      { onSaved: () => setSnapshot(JSON.stringify(rows)), then: andContinue ? () => router.push(nextTabHref(submissionId, "E")) : undefined },
    );

  return (
    <FormShell form="E" submissionId={submissionId} title={t("forms.E.title")} subtitle={`FOOM E — ${t("forms.E.so").toUpperCase()}`} completion={completion} canEdit={canEdit} dirty={dirty} saving={pending} onSave={onSave}>
      <div
        className={cn("flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border px-4 py-2.5 text-sm", matches ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}
        role="status"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {matches ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-destructive" aria-hidden />}
          {t("validation.check")}: Form D = Form E
        </span>
        <span>
          Form D: <span className="num font-medium">{fmt.money(formDPersonnel)}</span>
        </span>
        <span>
          Form E: <span className="num font-medium">{fmt.money(totalAnnual)}</span>
        </span>
        {!matches ? (
          <span className="text-destructive">
            {t("validation.difference")}: <span className="num font-medium">{fmt.money(formDPersonnel - totalAnnual, { signed: true })}</span> —{" "}
            <Link className="underline" href={`/budget/workspace/${submissionId}/d`}>
              Form D
            </Link>
          </span>
        ) : null}
      </div>

      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1050px] text-sm">
          <caption className="sr-only">{t("forms.E.title")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.positionTitle")}</th>
              <th scope="col" className="w-24 px-3 py-2 text-left font-medium">{t("forms.grade")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("forms.department")}</th>
              <th scope="col" className="w-28 px-3 py-2 text-right font-medium">{t("forms.approvedEstablishment")}</th>
              <th scope="col" className="w-28 px-3 py-2 text-right font-medium">{t("forms.filledPositions")}</th>
              <th scope="col" className="w-36 px-3 py-2 text-right font-medium">{t("forms.monthlyCost")}</th>
              <th scope="col" className="w-36 px-3 py-2 text-right font-medium">{t("forms.annualCost")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.remarks")}</th>
              <th scope="col" className="w-10">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const filled = toNumber(r.filledPositions);
              const est = toNumber(r.approvedEstablishment);
              const overEst = filled > est;
              const noCost = filled > 0 && toNumber(r.monthlyCost) <= 0;
              const dup = (duplicates.get(`${r.positionTitle.trim().toLowerCase()}|${r.grade.trim().toLowerCase()}`) ?? 0) > 1;
              const warnings = [
                overEst && `${t("forms.filledPositions")} > ${t("forms.approvedEstablishment")}`,
                noCost && `${t("forms.monthlyCost")} — ${t("common.required")}`,
                dup && `${t("status.DUPLICATE")}: ${t("forms.positionTitle")}`,
              ].filter(Boolean) as string[];
              return (
                <tr key={r.key} className={cn("border-b last:border-0", warnings.length && "bg-warning/5")}>
                  <td className="px-3 py-1.5">
                    <Input className="h-8" value={r.positionTitle} readOnly={!canEdit} onChange={(e) => update(r.key, { positionTitle: e.target.value })} aria-invalid={!r.positionTitle.trim() || dup || undefined} aria-label={t("forms.positionTitle")} maxLength={200} />
                    {warnings.length ? (
                      <p className="mt-1 flex items-start gap-1 text-xs text-warning-foreground dark:text-warning">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                        {warnings.join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input className="h-8" value={r.grade} readOnly={!canEdit} onChange={(e) => update(r.key, { grade: e.target.value })} aria-label={t("forms.grade")} maxLength={50} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input className="h-8" value={r.department} readOnly={!canEdit} onChange={(e) => update(r.key, { department: e.target.value })} aria-label={t("forms.department")} maxLength={150} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input className="num h-8 text-right" inputMode="numeric" value={r.approvedEstablishment} readOnly={!canEdit} onChange={(e) => update(r.key, { approvedEstablishment: e.target.value.replace(/\D/g, "") })} aria-label={t("forms.approvedEstablishment")} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input className="num h-8 text-right" inputMode="numeric" value={r.filledPositions} readOnly={!canEdit} onChange={(e) => update(r.key, { filledPositions: e.target.value.replace(/\D/g, "") })} aria-invalid={overEst || undefined} aria-label={t("forms.filledPositions")} />
                  </td>
                  <td className="px-3 py-1.5">
                    <MoneyInput value={r.monthlyCost} onValueChange={(v) => update(r.key, { monthlyCost: v })} readOnly={!canEdit} invalid={noCost} aria-label={t("forms.monthlyCost")} />
                  </td>
                  <td className="num px-3 py-1.5 text-right font-medium">{fmt.money(annual(r))}</td>
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
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <th scope="row" colSpan={3} className="px-3 py-2.5 text-left">
                {t("forms.totalPersonnelCost")}
              </th>
              <td className="num px-3 py-2.5 text-right">{sum(rows.map((r) => toNumber(r.approvedEstablishment))).toLocaleString("en-US")}</td>
              <td className="num px-3 py-2.5 text-right">{sum(rows.map((r) => toNumber(r.filledPositions))).toLocaleString("en-US")}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.money(sum(rows.map((r) => toNumber(r.monthlyCost))))}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.money(totalAnnual)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { key: `new-${seq++}`, positionTitle: "", grade: "", department: "", approvedEstablishment: "0", filledPositions: "0", monthlyCost: "", remarks: "" }])}
          >
            <Plus aria-hidden />
            {t("common.addRow")}
          </Button>
        ) : (
          <span />
        )}
        <p className="text-xs text-muted-foreground">
          {t("forms.hrCertification")}: {hrCertification ? `${hrCertification.name} · ${fmt.dateTime(hrCertification.at)}` : t("certification.notSigned")}
        </p>
      </div>
    </FormShell>
  );
}

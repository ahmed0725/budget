"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, SplitSquareHorizontal, XCircle } from "lucide-react";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateShare, sum, withinTolerance, type QuarterKey } from "@/lib/calculations";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { distributeCashFlowAction } from "../../../actions";
import { FormShell, MoneyInput, nextTabHref, toNumber, useFormSave } from "../form-kit";

interface Row {
  quarter: QuarterKey;
  amount: string;
  remarks: string;
}

export function FormH({
  submissionId,
  revision,
  canEdit,
  completion,
  totalBudget,
  procurementByQuarter,
  rows: initialRows,
}: {
  submissionId: string;
  revision: string;
  canEdit: boolean;
  completion: number;
  year: number;
  totalBudget: number;
  procurementByQuarter: Record<QuarterKey, number>;
  rows: Row[];
}) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [snapshot, setSnapshot] = useState(JSON.stringify(initialRows));
  const dirty = JSON.stringify(rows) !== snapshot;
  const { save, pending, getRevision } = useFormSave("H", submissionId, revision);
  const [distributing, startDistribute] = useTransition();
  const total = sum(rows.map((r) => toNumber(r.amount)));
  const matches = withinTolerance(total, totalBudget, 1);
  const label: Record<QuarterKey, string> = { Q1: t("forms.q1"), Q2: t("forms.q2"), Q3: t("forms.q3"), Q4: t("forms.q4") };

  const onSave = (andContinue: boolean) =>
    save(
      { rows: rows.map((r) => ({ quarter: r.quarter, amount: r.amount === "" ? 0 : r.amount, remarks: r.remarks || null })) },
      { onSaved: () => setSnapshot(JSON.stringify(rows)), then: andContinue ? () => router.push(nextTabHref(submissionId, "H")) : undefined },
    );

  return (
    <FormShell
      form="H"
      submissionId={submissionId}
      title={t("forms.H.title")}
      subtitle={`FOOM H — ${t("forms.H.so").toUpperCase()}`}
      completion={completion}
      canEdit={canEdit}
      dirty={dirty}
      saving={pending}
      onSave={onSave}
      extraActions={
        canEdit ? (
          <Button
            variant="outline"
            size="sm"
            disabled={distributing || dirty}
            title={dirty ? t("common.unsavedBadge") : undefined}
            onClick={() =>
              startDistribute(async () => {
                if (handleResult(await distributeCashFlowAction(submissionId, getRevision()))) {
                  toast.success(t("common.saved"));
                  router.refresh();
                }
              })
            }
          >
            {distributing ? <Loader2 className="animate-spin" aria-hidden /> : <SplitSquareHorizontal aria-hidden />}
            {t("forms.distributeEvenly")}
          </Button>
        ) : null
      }
    >
      <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border px-4 py-2.5 text-sm", matches ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")} role="status">
        <span className="inline-flex items-center gap-1.5 font-medium">
          {matches ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-destructive" aria-hidden />}
          Form H = Form B
        </span>
        <span>
          {t("forms.totalCashFlow")}: <span className="num font-medium">{fmt.money(total)}</span>
        </span>
        <span>
          {t("budget.totalBudget")}: <span className="num font-medium">{fmt.money(totalBudget)}</span>
        </span>
        {!matches ? (
          <span className="text-destructive">
            {t("validation.difference")}: <span className="num font-medium">{fmt.money(total - totalBudget, { signed: true })}</span>
          </span>
        ) : null}
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("forms.H.title")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.quarter")}</th>
              <th scope="col" className="w-44 px-3 py-2 text-right font-medium">{t("forms.cashRequirement")}</th>
              <th scope="col" className="w-32 px-3 py-2 text-right font-medium">{t("forms.percentOfTotal")}</th>
              <th scope="col" className="w-40 px-3 py-2 text-right font-medium">{t("forms.totalProcurement")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.remarks")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const share = calculateShare(toNumber(r.amount), totalBudget || total);
              const procurement = procurementByQuarter[r.quarter] ?? 0;
              const short = procurement > toNumber(r.amount) + 1;
              return (
                <tr key={r.quarter} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {label[r.quarter]}
                  </th>
                  <td className="px-3 py-1.5">
                    <MoneyInput value={r.amount} onValueChange={(v) => setRows((rs) => rs.map((x) => (x.quarter === r.quarter ? { ...x, amount: v } : x)))} readOnly={!canEdit} invalid={toNumber(r.amount) <= 0} aria-label={`${t("forms.cashRequirement")} ${r.quarter}`} />
                  </td>
                  <td className="num px-3 py-2 text-right">{fmt.percent(share, 1)}</td>
                  <td className={cn("num px-3 py-2 text-right", short ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>{fmt.money(procurement)}</td>
                  <td className="px-3 py-1.5">
                    <Input className="h-8" value={r.remarks} readOnly={!canEdit} onChange={(e) => setRows((rs) => rs.map((x) => (x.quarter === r.quarter ? { ...x, remarks: e.target.value } : x)))} aria-label={`${t("common.remarks")} ${r.quarter}`} maxLength={1000} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <th scope="row" className="px-3 py-2.5 text-left">
                {t("forms.totalCashFlow")}
              </th>
              <td className="num px-3 py-2.5 text-right">{fmt.money(total)}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.percent(calculateShare(total, totalBudget || total), 1)}</td>
              <td className="num px-3 py-2.5 text-right">{fmt.money(sum(Object.values(procurementByQuarter)))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </FormShell>
  );
}

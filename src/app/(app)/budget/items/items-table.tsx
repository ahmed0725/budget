"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Lock, Pencil } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/app/data-table";
import { Field } from "@/components/app/form-fields";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { bulkUpdateLinesAction, updateLineAction } from "../actions";

export interface ItemRow {
  id: string;
  submissionId: string;
  status: string;
  editable: boolean;
  mdaCode: string;
  mdaName: string;
  code: string;
  codeName: string;
  category: string | null;
  kind: string;
  description: string | null;
  amount: number;
  prior: number | null;
  change: number | null;
  changePct: number | null;
  source: string;
}

/** Amount cell: editable in place for draft/returned budgets the user may prepare. */
function AmountCell({ row }: { row: ItemRow }) {
  const fmt = useFormat();
  const { t } = useT();
  const router = useRouter();
  const [value, setValue] = useState(String(row.amount));
  const [pending, start] = useTransition();
  if (!row.editable) return <span className="num">{fmt.money(row.amount)}</span>;
  const save = () => {
    const n = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || n === row.amount) {
      setValue(String(row.amount));
      return;
    }
    start(async () => {
      if (handleResult(await updateLineAction({ lineId: row.id, amount: n }), t("common.saved"))) router.refresh();
      else setValue(String(row.amount));
    });
  };
  return (
    <div className="relative">
      <Input
        aria-label={`${t("common.amount")} ${row.mdaCode} ${row.code}`}
        className={cn("num h-7 w-36 text-right", pending && "opacity-60")}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setValue(String(row.amount));
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {pending ? <Loader2 className="absolute top-1.5 -left-5 size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
    </div>
  );
}

export function ItemsTable({ rows, total, page, pageSize, sort, toolbar, canBulk }: { rows: ItemRow[]; total: number; page: number; pageSize: number; sort: string | null; toolbar: React.ReactNode; canBulk: boolean }) {
  const { t } = useT();
  const fmt = useFormat();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const editableSelected = selected.filter((id) => rows.find((r) => r.id === id)?.editable);
  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(
    () => [
      {
        id: "mda",
        header: t("common.mda"),
        meta: { label: t("common.mda") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <Link href={`/budget/workspace/${row.original.submissionId}/${row.original.kind === "REVENUE" ? "c" : "d"}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            <span className="num font-medium">{row.original.mdaCode}</span> <span className="text-xs text-muted-foreground">{row.original.mdaName}</span>
          </Link>
        ),
      },
      {
        id: "code",
        header: t("common.code"),
        meta: { label: t("common.code") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div>
            <span className="num font-medium">{row.original.code}</span> {row.original.codeName}
            {row.original.description && row.original.description !== row.original.codeName ? <div className="text-xs text-muted-foreground">{row.original.description}</div> : null}
          </div>
        ),
      },
      { id: "category", header: t("common.category"), meta: { label: t("common.category") } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="text-xs">{row.original.category ?? "—"}</span> },
      { id: "kind", enableSorting: false, header: t("common.type"), meta: { label: t("common.type"), hidden: true } satisfies DataTableColumnMeta, cell: ({ row }) => (row.original.kind === "REVENUE" ? t("budget.revenueKind") : t("budget.expenditureKind")) },
      { id: "prior", enableSorting: false, header: t("budget.previousYear"), meta: { label: t("budget.previousYear"), align: "right" } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="num text-muted-foreground">{row.original.prior === null ? "—" : fmt.money(row.original.prior)}</span> },
      { id: "amount", header: t("common.amount"), meta: { label: t("common.amount"), align: "right" } satisfies DataTableColumnMeta, cell: ({ row }) => <AmountCell key={`${row.original.id}-${row.original.amount}`} row={row.original} /> },
      { id: "change", enableSorting: false, header: t("common.changePercent"), meta: { label: t("common.changePercent"), align: "right" } satisfies DataTableColumnMeta, cell: ({ row }) => <span className="num">{row.original.changePct === null ? "—" : fmt.percent(row.original.changePct, 1, { signed: true })}</span> },
      {
        id: "status",
        enableSorting: false,
        header: t("common.status"),
        meta: { label: t("common.status") } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            <StatusBadge status={row.original.status} />
            {!row.original.editable ? <Lock className="size-3 text-muted-foreground" aria-label={t("common.readOnly")} /> : null}
          </span>
        ),
      },
    ],
    [t, fmt],
  );
  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        tableKey="budget-items"
        selectable={canBulk}
        onSelectionChange={setSelected}
        toolbar={
          <div className="flex flex-wrap items-end gap-2">
            {toolbar}
            {canBulk ? (
              <Button size="sm" variant="outline" disabled={editableSelected.length === 0} onClick={() => setBulkOpen(true)}>
                <Pencil aria-hidden />
                {t("budget.bulkEdit")} {editableSelected.length ? `(${editableSelected.length})` : ""}
              </Button>
            ) : null}
          </div>
        }
      />
      {bulkOpen ? <BulkEditDialog ids={editableSelected} skipped={selected.length - editableSelected.length} onClose={() => setBulkOpen(false)} /> : null}
    </>
  );
}

function BulkEditDialog({ ids, skipped, onClose }: { ids: string[]; skipped: number; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"SET" | "PERCENT" | "ADD">("PERCENT");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("budget.bulkEdit")}</DialogTitle>
          <DialogDescription>
            {t("budget.bulkEditHint", { count: ids.length })}
            {skipped ? ` ${t("budget.bulkSkipped", { count: skipped })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="bulk-mode" label={t("budget.bulkMode")}>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger id="bulk-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">{t("budget.bulkPercent")}</SelectItem>
                <SelectItem value="ADD">{t("budget.bulkAdd")}</SelectItem>
                <SelectItem value="SET">{t("budget.bulkSet")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="bulk-value" label={mode === "PERCENT" ? "%" : t("common.amount")} hint={mode === "PERCENT" ? "e.g. 5 or -10" : undefined}>
            <Input id="bulk-value" inputMode="decimal" className="num text-right" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field id="bulk-reason" label={t("common.reason")} className="sm:col-span-2">
            <Textarea id="bulk-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || value.trim() === "" || !Number.isFinite(Number(value.replace(/,/g, "")))}
            onClick={() =>
              start(async () => {
                const res = handleResult(await bulkUpdateLinesAction({ lineIds: ids, mode, value: Number(value.replace(/,/g, "")), reason: reason || null }));
                if (res) {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t("common.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

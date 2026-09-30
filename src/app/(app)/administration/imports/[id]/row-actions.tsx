"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Loader2, Pencil, RotateCcw, Upload, X } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Field } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cancelImportAction, commitImportAction, correctImportRowAction, skipImportRowAction } from "../actions";

export function RowActions({ rowId, rowLabel, skipped, fields, values }: { rowId: string; rowLabel: string; skipped: boolean; fields: { key: string; label: string; required: boolean }[] | null; values: Record<string, string | number | null> | null }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="flex justify-end gap-1">
      {fields && values && !skipped ? (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("imports.correctTitle", { row: rowLabel })}
          title={t("imports.correctRow")}
          onClick={() => {
            setDraft(Object.fromEntries(fields.map((f) => [f.key, values[f.key] === null || values[f.key] === undefined ? "" : String(values[f.key])])));
            setEditing(true);
          }}
        >
          <Pencil aria-hidden />
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        aria-label={skipped ? t("imports.unskip") : t("imports.skipRow")}
        title={skipped ? t("imports.unskip") : t("imports.skipRow")}
        onClick={() =>
          start(async () => {
            if (handleResult(await skipImportRowAction(rowId, !skipped))) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : skipped ? <RotateCcw aria-hidden /> : <Ban aria-hidden />}
      </Button>
      {editing && fields ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("imports.correctTitle", { row: rowLabel })}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} id={`fix-${f.key}`} label={f.label}>
                  <Input id={`fix-${f.key}`} value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                </Field>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const values = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() === "" ? null : v]));
                    if (handleResult(await correctImportRowAction(rowId, values), t("common.saved"))) {
                      setEditing(false);
                      router.refresh();
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
      ) : null}
    </div>
  );
}

export function CommitBar({ importId, importable }: { importId: string; importable: number }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ConfirmDialog
        destructive
        trigger={
          <Button variant="outline" size="sm">
            <X aria-hidden />
            {t("imports.cancelImport")}
          </Button>
        }
        title={t("imports.cancelImport")}
        description={t("imports.cancelConfirm")}
        onConfirm={async () => {
          if (handleResult(await cancelImportAction(importId))) router.refresh();
        }}
      />
      <ConfirmDialog
        trigger={
          <Button size="sm" disabled={importable === 0}>
            <Upload aria-hidden />
            {t("imports.runImport")} ({importable})
          </Button>
        }
        title={t("imports.runImport")}
        description={t("imports.confirmImport", { count: importable })}
        confirmLabel={t("imports.import")}
        onConfirm={async () => {
          if (handleResult(await commitImportAction(importId), t("imports.completed"))) router.refresh();
        }}
      />
    </div>
  );
}

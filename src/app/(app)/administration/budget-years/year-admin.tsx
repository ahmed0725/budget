"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, Pencil, Plus } from "lucide-react";
import { TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { yearSchema, type YearInput } from "@/lib/validations/admin";
import { changeYearStatusAction, saveYearAction } from "../actions";

export type YearFormValues = YearInput;

const DATE_GROUPS: [keyof YearInput, keyof YearInput][] = [
  ["startDate", "endDate"],
  ["preparationStart", "preparationEnd"],
  ["submissionDeadline", "closingDate"],
  ["reviewStart", "reviewEnd"],
  ["approvalStart", "approvalEnd"],
  ["executionStart", "executionEnd"],
];

function emptyYear(year: number): YearInput {
  return {
    year,
    name: `Miisaaniyadda ${year}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    preparationStart: `${year - 1}-07-01`,
    preparationEnd: `${year - 1}-09-30`,
    submissionDeadline: `${year - 1}-10-05`,
    reviewStart: `${year - 1}-10-06`,
    reviewEnd: `${year - 1}-11-15`,
    approvalStart: `${year - 1}-11-16`,
    approvalEnd: `${year - 1}-12-31`,
    executionStart: `${year}-01-01`,
    executionEnd: `${year}-12-31`,
    closingDate: `${year + 1}-03-31`,
    notes: null,
  };
}

export function YearFormDialog({ yearId, defaults, suggestedYear }: { yearId?: string; defaults?: YearInput; suggestedYear?: number }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = defaults ?? emptyYear(suggestedYear ?? new Date().getFullYear() + 1);
  const form = useForm<YearInput>({ resolver: zodResolver(yearSchema) as never, defaultValues: initial });
  const e = form.formState.errors;
  const [problems, setProblems] = useState<string[]>([]);
  const submit = form.handleSubmit(async (values) => {
    const res = await saveYearAction(yearId ?? null, values);
    if (!res.ok) setProblems(res.error.details ?? []);
    if (handleResult(res, t("common.saved"))) {
      setOpen(false);
      router.refresh();
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setProblems([]);
        if (o) form.reset(initial);
      }}
    >
      <DialogTrigger asChild>
        {yearId ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden />
            {t("common.edit")}
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden />
            {t("admin.newYear")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{yearId ? t("admin.editYear") : t("admin.newYear")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField register={form.register} name="year" label={t("common.year")} type="number" required error={e.year?.message} />
              <TextField register={form.register} name="name" label={t("common.name")} required error={e.name?.message} />
              {DATE_GROUPS.flat().map((f) => (
                <TextField key={f} register={form.register} name={f} label={t(`admin.${f}` as "admin.startDate")} type="date" required={f === "startDate" || f === "endDate"} error={e[f]?.message} />
              ))}
              <TextField register={form.register} name="notes" label={t("common.notes")} multiline className="sm:col-span-2" />
            </div>
            {problems.length ? (
              <ul role="alert" className="mt-3 list-disc space-y-1 rounded-md border border-destructive/40 bg-destructive/5 py-2 pr-3 pl-7 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function YearStatusControl({ yearId, year, status, allowed }: { yearId: string; year: number; status: string; allowed: string[] }) {
  const { t } = useT();
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!allowed.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            {t("admin.changeStatus")}
            <ArrowRight aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {allowed.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => setTarget(s)}>
              {t("admin.moveTo")}: {t(`status.${s}` as "status.DRAFT")}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target === "PUBLISHED" ? t("admin.publishYear") : t("admin.changeStatus")}</DialogTitle>
            <DialogDescription>{t("admin.statusChangeConfirm", { year, from: t(`status.${status}` as "status.DRAFT"), to: target ? t(`status.${target}` as "status.DRAFT") : "" })}</DialogDescription>
          </DialogHeader>
          {target === "PUBLISHED" ? <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{t("admin.publishWarning")}</p> : null}
          <div className="space-y-1">
            <Label htmlFor="year-reason">{t("common.reason")}</Label>
            <Textarea id="year-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await changeYearStatusAction(yearId, target!, reason.trim() || null);
                  if (handleResult(res, t("common.saved"))) {
                    setTarget(null);
                    setReason("");
                    router.refresh();
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

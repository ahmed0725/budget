"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Ban, Banknote, CheckCircle2, FilePlus2, Loader2, PenLine } from "lucide-react";
import { Field } from "@/components/app/form-fields";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { MONTH_NAMES_LONG } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { allocationOptionsAction, commitmentStatusAction, createCommitmentAction, recordActualAction } from "./actions";

interface Option {
  value: string;
  label: string;
}
interface Allocation {
  codeId: string;
  code: string;
  name: string;
  available: number;
  revised: number;
  actual: number;
}

function Picker({ id, value, onChange, options, placeholder, disabled }: { id: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
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

/** Allocations (codes) of the selected MDA for the year. */
function useAllocations(year: number, mdaId: string, kind: "EXPENDITURE" | "REVENUE") {
  const key = mdaId ? `${year}|${mdaId}|${kind}` : null;
  const [loaded, setLoaded] = useState<{ key: string | null; list: Allocation[] }>({ key: null, list: [] });
  useEffect(() => {
    if (!key) return;
    let live = true;
    allocationOptionsAction({ year, mdaId, kind }).then((res) => {
      if (live) setLoaded({ key, list: res.ok ? res.data : [] });
    });
    return () => {
      live = false;
    };
  }, [key, year, mdaId, kind]);
  return { list: key && loaded.key === key ? loaded.list : [], loading: key !== null && loaded.key !== key };
}

export function RecordActualDialog({ year, kind, mdas, defaultMdaId }: { year: number; kind: "EXPENDITURE" | "REVENUE"; mdas: Option[]; defaultMdaId?: string }) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = { mdaId: defaultMdaId ?? (mdas.length === 1 ? mdas[0].value : ""), codeId: "", month: String(new Date().getMonth() + 1), actual: "", planned: "", remarks: "" };
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const { list, loading } = useAllocations(year, s.mdaId, kind);
  const current = list.find((a) => a.codeId === s.codeId);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setS(initial);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PenLine aria-hidden />
          {kind === "EXPENDITURE" ? t("execution.recordActual") : t("execution.recordCollection")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "EXPENDITURE" ? t("execution.recordActual") : t("execution.recordCollection")}</DialogTitle>
          <DialogDescription>{t("execution.recordHint", { year })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ra-mda" label={t("common.mda")} required error={errors.mdaId?.[0]} className="sm:col-span-2">
            <Picker id="ra-mda" value={s.mdaId} onChange={(v) => setS({ ...s, mdaId: v, codeId: "" })} options={mdas} placeholder={t("common.select")} />
          </Field>
          <Field id="ra-code" label={t("common.code")} required error={errors.codeId?.[0]} className="sm:col-span-2" hint={current ? `${t("execution.revisedBudget")}: ${fmt.money(current.revised)} · ${t("common.actual")}: ${fmt.money(current.actual)}` : undefined}>
            <Picker id="ra-code" value={s.codeId} onChange={(v) => setS({ ...s, codeId: v })} options={list.map((a) => ({ value: a.codeId, label: `${a.code} ${a.name}` }))} placeholder={loading ? t("common.loading") : t("common.select")} disabled={!s.mdaId || loading} />
          </Field>
          <Field id="ra-month" label={t("common.month")} required error={errors.month?.[0]}>
            <Picker id="ra-month" value={s.month} onChange={(v) => setS({ ...s, month: v })} options={MONTH_NAMES_LONG[locale].map((m, i) => ({ value: String(i + 1), label: `${m} ${year}` }))} />
          </Field>
          <Field id="ra-actual" label={kind === "EXPENDITURE" ? t("execution.actualExpenditure") : t("execution.actualRevenue")} required error={errors.actual?.[0]}>
            <Input id="ra-actual" inputMode="decimal" className="num text-right" value={s.actual} onChange={(e) => setS({ ...s, actual: e.target.value })} />
          </Field>
          <Field id="ra-planned" label={kind === "EXPENDITURE" ? t("common.planned") : t("common.target")} hint={t("common.optional")}>
            <Input id="ra-planned" inputMode="decimal" className="num text-right" value={s.planned} onChange={(e) => setS({ ...s, planned: e.target.value })} />
          </Field>
          <Field id="ra-remarks" label={t("common.remarks")} className="sm:col-span-2">
            <Textarea id="ra-remarks" rows={2} value={s.remarks} onChange={(e) => setS({ ...s, remarks: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await recordActualAction({ year, kind, ...s, actual: s.actual.replace(/,/g, ""), planned: s.planned.replace(/,/g, "") });
                setErrors(res.ok ? {} : (res.error.fieldErrors ?? {}));
                if (handleResult(res, t("common.saved"))) {
                  setOpen(false);
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
  );
}

export function NewCommitmentDialog({ year, mdas, defaultMdaId }: { year: number; mdas: Option[]; defaultMdaId?: string }) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const initial = { mdaId: defaultMdaId ?? (mdas.length === 1 ? mdas[0].value : ""), codeId: "", reference: "", description: "", supplier: "", amount: "", commitmentDate: today.startsWith(String(year)) ? today : `${year}-01-01` };
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const { list, loading } = useAllocations(year, s.mdaId, "EXPENDITURE");
  const current = list.find((a) => a.codeId === s.codeId);
  const amount = Number(s.amount.replace(/,/g, "")) || 0;
  const exceeds = current ? amount > current.available : false;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setS(initial);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus2 aria-hidden />
          {t("execution.newCommitment")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("execution.newCommitment")}</DialogTitle>
          <DialogDescription>{t("execution.commitmentHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="nc-mda" label={t("common.mda")} required error={errors.mdaId?.[0]} className="sm:col-span-2">
            <Picker id="nc-mda" value={s.mdaId} onChange={(v) => setS({ ...s, mdaId: v, codeId: "" })} options={mdas} placeholder={t("common.select")} />
          </Field>
          <Field id="nc-code" label={t("common.code")} required error={errors.codeId?.[0]} className="sm:col-span-2">
            <Picker id="nc-code" value={s.codeId} onChange={(v) => setS({ ...s, codeId: v })} options={list.map((a) => ({ value: a.codeId, label: `${a.code} ${a.name} · ${t("execution.availableBalance")} ${fmt.money(a.available)}` }))} placeholder={loading ? t("common.loading") : t("common.select")} disabled={!s.mdaId || loading} />
          </Field>
          <Field id="nc-ref" label={t("execution.reference")} required error={errors.reference?.[0]} hint="e.g. LPO-2026-0142">
            <Input id="nc-ref" value={s.reference} onChange={(e) => setS({ ...s, reference: e.target.value })} />
          </Field>
          <Field id="nc-date" label={t("execution.commitmentDate")} required error={errors.commitmentDate?.[0]}>
            <Input id="nc-date" type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={s.commitmentDate} onChange={(e) => setS({ ...s, commitmentDate: e.target.value })} />
          </Field>
          <Field id="nc-desc" label={t("common.description")} required error={errors.description?.[0]} className="sm:col-span-2">
            <Input id="nc-desc" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
          </Field>
          <Field id="nc-supplier" label={t("execution.supplier")} error={errors.supplier?.[0]}>
            <Input id="nc-supplier" value={s.supplier} onChange={(e) => setS({ ...s, supplier: e.target.value })} />
          </Field>
          <Field id="nc-amount" label={t("common.amount")} required error={errors.amount?.[0] ?? (exceeds ? t("execution.exceedsAvailable", { available: fmt.money(current!.available) }) : undefined)}>
            <Input id="nc-amount" inputMode="decimal" className="num text-right" aria-invalid={exceeds} value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || exceeds}
            onClick={() =>
              start(async () => {
                const res = await createCommitmentAction({ year, ...s, amount: s.amount.replace(/,/g, "") });
                setErrors(res.ok ? {} : (res.error.fieldErrors ?? {}));
                if (handleResult(res, t("common.saved"))) {
                  setOpen(false);
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
  );
}

export function CommitmentActions({ id, status, reference }: { id: string; status: string; reference: string }) {
  const { t } = useT();
  const router = useRouter();
  const [action, setAction] = useState<"OBLIGATE" | "PAY" | "CANCEL" | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (status !== "COMMITTED" && status !== "OBLIGATED") return null;
  const titles = { OBLIGATE: t("execution.markObligated"), PAY: t("execution.markLiquidated"), CANCEL: t("execution.cancel") };
  const bodies = { OBLIGATE: t("execution.obligateConfirm", { ref: reference }), PAY: t("execution.payConfirm", { ref: reference }), CANCEL: t("execution.cancelConfirm", { ref: reference }) };
  return (
    <div className="flex justify-end gap-1">
      {status === "COMMITTED" ? (
        <Button size="icon-sm" variant="ghost" title={titles.OBLIGATE} aria-label={`${titles.OBLIGATE} ${reference}`} onClick={() => setAction("OBLIGATE")}>
          <CheckCircle2 aria-hidden />
        </Button>
      ) : null}
      <Button size="icon-sm" variant="ghost" title={titles.PAY} aria-label={`${titles.PAY} ${reference}`} onClick={() => setAction("PAY")}>
        <Banknote aria-hidden />
      </Button>
      <Button size="icon-sm" variant="ghost" title={titles.CANCEL} aria-label={`${titles.CANCEL} ${reference}`} onClick={() => setAction("CANCEL")}>
        <Ban aria-hidden />
      </Button>
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? titles[action] : ""}</DialogTitle>
            <DialogDescription>{action ? bodies[action] : ""}</DialogDescription>
          </DialogHeader>
          {action === "CANCEL" ? (
            <Field id="cm-reason" label={t("common.reason")} required>
              <Textarea id="cm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={action === "CANCEL" ? "destructive" : "default"}
              disabled={pending || (action === "CANCEL" && !reason.trim())}
              onClick={() =>
                start(async () => {
                  if (handleResult(await commitmentStatusAction(id, action!, reason), t("common.saved"))) {
                    setAction(null);
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
    </div>
  );
}

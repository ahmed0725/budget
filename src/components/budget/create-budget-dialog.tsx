"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { createSubmissionAction } from "@/app/(app)/budget/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";

/** Create a budget submission for an MDA without one in the preparation year. */
export function CreateBudgetDialog({ year, mdas, trigger }: { year: { id: string; year: number }; mdas: { id: string; label: string }[]; trigger?: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mdaId, setMdaId] = useState(mdas[0]?.id ?? "");
  const [prefill, setPrefill] = useState<"PRIOR_YEAR" | "EMPTY">("PRIOR_YEAR");
  const [pending, start] = useTransition();
  if (mdas.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus aria-hidden />
            {t("budget.createBudget")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("budget.createBudgetFor", { year: year.year })}</DialogTitle>
          <DialogDescription>{t("app.tagline")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-mda">{t("common.mda")}</Label>
            <Select value={mdaId} onValueChange={setMdaId}>
              <SelectTrigger id="create-mda" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mdas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("budget.prefill")}</legend>
            <RadioGroup value={prefill} onValueChange={(v) => setPrefill(v as "PRIOR_YEAR" | "EMPTY")}>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="PRIOR_YEAR" /> {t("budget.prefillPrior")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="EMPTY" /> {t("budget.prefillEmpty")}
              </label>
            </RadioGroup>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || !mdaId}
            onClick={() =>
              start(async () => {
                const res = handleResult(await createSubmissionAction({ budgetYearId: year.id, mdaId, prefill }));
                if (res) {
                  setOpen(false);
                  router.push(`/budget/workspace/${res.id}/a`);
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

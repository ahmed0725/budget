"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, RotateCcw, Send, ThumbsUp, Trash2, Upload, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { workflowAction } from "../../actions";

type Action = { action: string; requiresComment: boolean; requiresValidation: boolean; to: string };
type Correction = { form: string; section: string; comment: string; requiredCorrection: string };

const ICON: Record<string, LucideIcon> = {
  SUBMIT: Send,
  RESUBMIT: Send,
  START_REVIEW: CheckCircle2,
  RECOMMEND: ThumbsUp,
  ENDORSE: ThumbsUp,
  APPROVE: CheckCircle2,
  PUBLISH: Upload,
  RETURN: RotateCcw,
  REJECT: XCircle,
  WITHDRAW: RotateCcw,
  REOPEN: RotateCcw,
};
const PRIMARY = new Set(["SUBMIT", "RESUBMIT", "START_REVIEW", "RECOMMEND", "ENDORSE", "APPROVE", "PUBLISH"]);
const FORMS = ["A", "B", "C", "D", "E", "F", "G", "H", "GENERAL"];

export function WorkflowActions({ submissionId, actions, validationErrors }: { submissionId: string; actions: Action[]; validationErrors: number }) {
  const { t } = useT();
  const [current, setCurrent] = useState<Action | null>(null);
  if (actions.length === 0) return null;
  const ordered = [...actions].sort((a, b) => Number(PRIMARY.has(b.action)) - Number(PRIMARY.has(a.action)));
  return (
    <>
      {ordered.map((a) => {
        const Icon = ICON[a.action] ?? Send;
        const primary = PRIMARY.has(a.action);
        return (
          <Button
            key={a.action}
            size="sm"
            variant={a.action === "REJECT" ? "destructive" : primary ? "default" : "outline"}
            onClick={() => setCurrent(a)}
            title={a.requiresValidation && validationErrors > 0 ? t("validation.blocking") : undefined}
          >
            <Icon aria-hidden />
            {t(`workflow.${a.action}` as "workflow.SUBMIT")}
          </Button>
        );
      })}
      {current ? <ActionDialog submissionId={submissionId} action={current} validationErrors={validationErrors} onClose={() => setCurrent(null)} /> : null}
    </>
  );
}

function ActionDialog({ submissionId, action, validationErrors, onClose }: { submissionId: string; action: Action; validationErrors: number; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [corrections, setCorrections] = useState<Correction[]>(action.action === "RETURN" ? [{ form: "GENERAL", section: "", comment: "", requiredCorrection: "" }] : []);
  const [pending, start] = useTransition();
  const label = t(`workflow.${action.action}` as "workflow.SUBMIT");
  const isReturn = action.action === "RETURN";
  const isSubmit = action.action === "SUBMIT" || action.action === "RESUBMIT";
  const validCorrections = corrections.filter((c) => c.comment.trim() && c.requiredCorrection.trim());
  const missingComment = action.requiresComment && !comment.trim();

  const submit = () =>
    start(async () => {
      const res = handleResult(
        await workflowAction({
          submissionId,
          action: action.action,
          comment: comment.trim() || null,
          corrections: validCorrections.map((c) => ({ form: c.form, section: c.section || null, field: null, comment: c.comment, requiredCorrection: c.requiredCorrection })),
        }),
      );
      if (res) {
        toast.success(t("workflow.done", { action: label }));
        onClose();
        router.refresh();
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={isReturn ? "sm:max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{t("workflow.confirmTitle", { action: label })}</DialogTitle>
          <DialogDescription>
            {isSubmit ? t("certification.statement") : action.requiresComment ? t("workflow.commentRequired") : t(`status.${action.to}` as "status.DRAFT")}
          </DialogDescription>
        </DialogHeader>
        {action.requiresValidation && validationErrors > 0 ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            {t("validation.errors", { count: validationErrors })} — {t("validation.blocking")}
          </p>
        ) : null}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="wf-comment">
              {t("workflow.commentLabel")} {action.requiresComment ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">({t("common.optional")})</span>}
            </Label>
            <Textarea id="wf-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={4000} aria-invalid={missingComment} />
          </div>
          {isReturn ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t("workflow.corrections")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setCorrections([...corrections, { form: "GENERAL", section: "", comment: "", requiredCorrection: "" }])}>
                  <Plus aria-hidden />
                  {t("workflow.addCorrection")}
                </Button>
              </div>
              {corrections.map((c, i) => (
                <fieldset key={i} className="space-y-2 rounded-md border p-3">
                  <legend className="sr-only">
                    {t("workflow.corrections")} {i + 1}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("workflow.correctionForm")}</Label>
                      <Select value={c.form} onValueChange={(v) => setCorrections(corrections.map((x, j) => (j === i ? { ...x, form: v } : x)))}>
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f === "GENERAL" ? t("admin.general") : t("budget.formLabel", { form: f })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("workflow.correctionSection")}</Label>
                      <Input className="h-7" value={c.section} onChange={(e) => setCorrections(corrections.map((x, j) => (j === i ? { ...x, section: e.target.value } : x)))} maxLength={150} />
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="self-end" aria-label={t("common.remove")} onClick={() => setCorrections(corrections.filter((_, j) => j !== i))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("workflow.correctionComment")}</Label>
                      <Textarea rows={2} value={c.comment} onChange={(e) => setCorrections(corrections.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} maxLength={2000} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("workflow.correctionRequired")}</Label>
                      <Textarea rows={2} value={c.requiredCorrection} onChange={(e) => setCorrections(corrections.map((x, j) => (j === i ? { ...x, requiredCorrection: e.target.value } : x)))} maxLength={2000} />
                    </div>
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant={action.action === "REJECT" ? "destructive" : "default"} disabled={pending || missingComment} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

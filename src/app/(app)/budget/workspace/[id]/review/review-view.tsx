"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageSquare, RotateCcw, Send, UserCheck } from "lucide-react";
import { ApprovalTimeline, type TimelineStep } from "@/components/app/approval-timeline";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { addCommentAction, assignReviewerAction, resolveCorrectionAction, verifyCorrectionAction } from "../../../actions";

interface Correction {
  id: string;
  form: string;
  section: string | null;
  comment: string;
  requiredCorrection: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  returnedBy: string | null;
  reason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  verifiedBy: string | null;
}

export function ReviewView({
  submissionId,
  status,
  stage,
  assignedReviewer,
  reviewers,
  permissions,
  steps,
  corrections,
  comments,
}: {
  submissionId: string;
  status: string;
  stage: string;
  assignedReviewer: { id: string; name: string } | null;
  reviewers: { id: string; name: string; title: string | null }[];
  permissions: { canAssign: boolean; canComment: boolean; canResolve: boolean; canVerify: boolean };
  steps: TimelineStep[];
  corrections: Correction[];
  comments: { id: string; author: string; title: string | null; body: string; form: string | null; createdAt: string }[];
}) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ ok: boolean } & object>, success?: string) =>
    start(async () => {
      if (handleResult((await fn()) as never, success)) router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <section aria-labelledby="corrections-title" className="space-y-3">
          <h2 id="corrections-title" className="text-lg font-semibold">
            {t("workflow.corrections")}
          </h2>
          {corrections.length === 0 ? (
            <EmptyState title={t("workflow.noCorrections")} />
          ) : (
            <ul className="space-y-3">
              {corrections.map((c) => (
                <li key={c.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/budget/workspace/${submissionId}/${c.form === "GENERAL" ? "a" : c.form.toLowerCase()}`} className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground hover:underline">
                        {c.form === "GENERAL" ? t("admin.general") : t("budget.formLabel", { form: c.form })}
                      </Link>
                      {c.section ? <span className="font-medium">{c.section}</span> : null}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("workflow.returnedBy", { name: c.returnedBy ?? "—", date: fmt.dateTime(c.createdAt) })}</p>
                  {c.reason ? <p className="mt-1 text-xs text-muted-foreground italic">{c.reason}</p> : null}
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("workflow.correctionComment")}</dt>
                      <dd>{c.comment}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("workflow.correctionRequired")}</dt>
                      <dd className="font-medium">{c.requiredCorrection}</dd>
                    </div>
                  </dl>
                  {c.resolutionNote ? (
                    <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-line">
                      <span className="text-xs text-muted-foreground">
                        {c.resolvedBy} · {c.resolvedAt ? fmt.dateTime(c.resolvedAt) : ""}
                      </span>
                      <br />
                      {c.resolutionNote}
                    </p>
                  ) : null}
                  {permissions.canResolve && (c.status === "OPEN" || c.status === "REOPENED") ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Textarea
                        aria-label={t("workflow.resolutionNote")}
                        placeholder={t("workflow.resolutionNote")}
                        rows={2}
                        className="flex-1"
                        value={notes[c.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                        maxLength={2000}
                      />
                      <Button size="sm" disabled={pending || !(notes[c.id] ?? "").trim()} onClick={() => run(() => resolveCorrectionAction(submissionId, c.id, notes[c.id] ?? ""), t("common.saved"))}>
                        <Check aria-hidden />
                        {t("workflow.resolve")}
                      </Button>
                    </div>
                  ) : null}
                  {permissions.canVerify && c.status === "RESOLVED" ? (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => verifyCorrectionAction(submissionId, c.id, true, null))}>
                        <Check aria-hidden />
                        {t("workflow.accept")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => verifyCorrectionAction(submissionId, c.id, false, null))}>
                        <RotateCcw aria-hidden />
                        {t("workflow.reopenCorrection")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="timeline-title" className="space-y-3">
          <h2 id="timeline-title" className="text-lg font-semibold">
            {t("workflow.timeline")}
          </h2>
          <div className="rounded-lg border bg-card p-4">
            <ApprovalTimeline steps={steps} currentStage={stage} status={status} />
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-lg border bg-card p-4" aria-labelledby="reviewer-title">
          <h2 id="reviewer-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <UserCheck className="size-4" aria-hidden />
            {t("workflow.assignedReviewer")}
          </h2>
          <p className="mt-2 text-sm">{assignedReviewer?.name ?? <span className="text-muted-foreground">{t("workflow.unassigned")}</span>}</p>
          {permissions.canAssign && reviewers.length ? (
            <div className="mt-3">
              <Select value={assignedReviewer?.id} onValueChange={(v) => run(() => assignReviewerAction(submissionId, v), t("common.saved"))} disabled={pending}>
                <SelectTrigger className="w-full" aria-label={t("workflow.assignReviewer")}>
                  <SelectValue placeholder={t("workflow.assignReviewer")} />
                </SelectTrigger>
                <SelectContent>
                  {reviewers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.title ? ` — ${r.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-card p-4" aria-labelledby="comments-title">
          <h2 id="comments-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquare className="size-4" aria-hidden />
            {t("common.comments")}
          </h2>
          <ul className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">
            {comments.length === 0 ? <li className="text-sm text-muted-foreground">—</li> : null}
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author}</span> · {fmt.relative(c.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-line">{c.body}</p>
              </li>
            ))}
          </ul>
          {permissions.canComment ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                start(async () => {
                  if (handleResult(await addCommentAction(submissionId, comment, null))) {
                    setComment("");
                    toast.success(t("common.saved"));
                    router.refresh();
                  }
                });
              }}
            >
              <Textarea aria-label={t("common.comment")} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} />
              <Button type="submit" size="sm" disabled={pending || !comment.trim()}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {t("common.submit")}
              </Button>
            </form>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Download, FileSpreadsheet, FileText, GitBranch, History, Loader2, Lock, Save, ShieldCheck, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { createRevisionAction, runValidationAction, saveVersionAction } from "../../actions";
import type { WorkspaceHeader as Header } from "./data";
import { WorkflowActions } from "./workflow-actions";
import { daysUntil } from "@/lib/budget-years";

const FORMS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export function WorkspaceHeader({
  header,
  actions,
  permissions,
}: {
  header: Header;
  actions: { action: string; requiresComment: boolean; requiresValidation: boolean; to: string }[];
  permissions: { canValidate: boolean; canSaveVersion: boolean; canExport: boolean; canRevise: boolean };
}) {
  const { t, locale } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [validating, startValidate] = useTransition();
  const base = `/budget/workspace/${header.id}`;
  const deadline = header.deadline ? new Date(header.deadline) : null;
  const daysLeft = deadline ? daysUntil(deadline) : null;
  const preparing = header.status === "DRAFT" || header.status === "RETURNED";

  return (
    <div className="mb-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link href="/budget/submissions" className="hover:text-foreground hover:underline">
              {t("nav.submissions")}
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("budget.workspaceTitle", { year: header.year })}</h1>
            <StatusBadge status={header.status} />
            {header.type === "REVISION" ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-accent px-2 text-xs font-medium text-accent-foreground">
                <GitBranch className="size-3.5" aria-hidden />
                {t("budget.revision")} {header.revisionNumber} · {t(`budget.${header.revisionType ?? "SUPPLEMENTARY"}` as "budget.SUPPLEMENTARY")}
              </span>
            ) : null}
            {header.isLocked ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {t("common.readOnly")}
              </span>
            ) : null}
            {header.source === "IMPORT" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("common.imported")}</span> : null}
          </div>
          <p className="text-sm">
            <span className="font-medium">{t("common.mda")}:</span> {header.mda.code} — {locale === "en" && header.mda.nameEn ? `${header.mda.nameEn} (${header.mda.name})` : header.mda.name}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{header.mda.sector}</span>
            {header.assignedReviewer ? (
              <span>
                {t("workflow.assignedReviewer")}: {header.assignedReviewer.name}
              </span>
            ) : null}
            {header.submittedAt ? <span>{t("workflow.submittedOn", { date: fmt.date(header.submittedAt) })}</span> : null}
            {preparing && deadline ? (
              <span className={cn("inline-flex items-center gap-1", daysLeft !== null && daysLeft < 0 ? "text-destructive" : daysLeft !== null && daysLeft <= 7 ? "text-warning-foreground dark:text-warning" : "")}>
                <CalendarClock className="size-3.5" aria-hidden />
                {t("dashboard.deadline")}: {fmt.calendarDate(header.deadline)} ({daysLeft !== null && daysLeft < 0 ? t("dashboard.overdue", { days: -daysLeft }) : t("dashboard.daysLeft", { days: daysLeft ?? 0 })})
              </span>
            ) : null}
          </div>
          {header.type === "REVISION" && header.revisionReason ? <p className="text-xs text-muted-foreground">{t("budget.revisionReason")}: {header.revisionReason}</p> : null}
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {permissions.canValidate ? (
            <Button
              variant="outline"
              size="sm"
              disabled={validating}
              onClick={() =>
                startValidate(async () => {
                  const res = handleResult(await runValidationAction(header.id));
                  if (res) {
                    toast[res.errors ? "warning" : "success"](`${t("validation.checksPassed", { count: res.passed })} · ${t("validation.warnings", { count: res.warnings })} · ${t("validation.errors", { count: res.errors })}`);
                    router.push(`${base}/validation`);
                  }
                })
              }
            >
              {validating ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
              {t("common.validate")}
            </Button>
          ) : null}
          {permissions.canSaveVersion ? <SaveVersionButton submissionId={header.id} /> : null}
          {permissions.canExport ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download aria-hidden />
                  {t("common.download")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/export/submission/${header.id}?format=xlsx`}>
                    <FileSpreadsheet aria-hidden />
                    {t("budget.downloadForms")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/export/submission/${header.id}?format=pdf`}>
                    <FileText aria-hidden />
                    {t("budget.downloadPackage")}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base}/history`}>
              <History aria-hidden />
              {t("budget.viewHistory")}
            </Link>
          </Button>
          {permissions.canRevise ? <CreateRevisionButton submissionId={header.id} /> : null}
          <WorkflowActions submissionId={header.id} actions={actions} validationErrors={header.tally.errors} />
        </div>
      </div>

      {/* Progress indicator: forms A–H and validation */}
      <div className="flex flex-wrap items-stretch gap-2 rounded-lg border bg-card p-2" aria-label={t("dashboard.formCompletion")}>
        {FORMS.map((f) => {
          const pct = header.completion[f];
          return (
            <Link
              key={f}
              href={`${base}/${f.toLowerCase()}`}
              className="flex min-w-24 flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              title={t(`forms.${f}.title`)}
            >
              <span className="font-medium">
                {t("budget.formLabel", { form: f })}
              </span>
              {pct >= 100 ? (
                <span className="inline-flex items-center gap-0.5 text-success">
                  <Check className="size-3.5" aria-hidden />
                  <span className="sr-only">100%</span>
                </span>
              ) : (
                <span className="num text-muted-foreground">{pct}%</span>
              )}
            </Link>
          );
        })}
        <Link href={`${base}/validation`} className="flex min-w-40 flex-1 items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          <span className="font-medium">{t("budget.validation")}</span>
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5 text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {header.tally.passed}/{header.tally.total}
            </span>
            {header.tally.warnings ? (
              <span className="inline-flex items-center gap-0.5 text-warning-foreground dark:text-warning">
                <AlertTriangle className="size-3.5" aria-hidden />
                {header.tally.warnings}
              </span>
            ) : null}
            {header.tally.errors ? (
              <span className="inline-flex items-center gap-0.5 text-destructive">
                <XCircle className="size-3.5" aria-hidden />
                {header.tally.errors}
              </span>
            ) : null}
          </span>
        </Link>
      </div>
    </div>
  );
}

function SaveVersionButton({ submissionId }: { submissionId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save aria-hidden />
          {t("budget.saveVersion")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("budget.saveVersion")}</DialogTitle>
          <DialogDescription>{t("budget.versions")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="version-reason">{t("budget.versionReason")}</Label>
          <Textarea id="version-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = handleResult(await saveVersionAction(submissionId, reason));
                if (res) {
                  toast.success(`${t("common.saved")}: ${res.label}`);
                  setOpen(false);
                  setReason("");
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

function CreateRevisionButton({ submissionId }: { submissionId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("SUPPLEMENTARY");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const types = ["SUPPLEMENTARY", "REALLOCATION", "BUDGET_CUT", "BUDGET_INCREASE", "AGENCY_ADJUSTMENT"] as const;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch aria-hidden />
          {t("budget.createRevision")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("budget.createRevision")}</DialogTitle>
          <DialogDescription>{t("budget.locked")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="revision-type">{t("budget.revisionType")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="revision-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {t(`budget.${ty}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revision-reason">{t("budget.revisionReason")}</Label>
            <Textarea id="revision-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={pending || reason.trim().length < 10}
            onClick={() =>
              start(async () => {
                const res = handleResult(await createRevisionAction({ submissionId, revisionType: type, reason }));
                if (res) {
                  setOpen(false);
                  router.push(`/budget/workspace/${res.id}/d`);
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

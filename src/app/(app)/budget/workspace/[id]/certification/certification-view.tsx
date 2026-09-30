"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BadgeCheck, CircleDashed, FileSignature, Loader2, Stamp, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { certifyAction, revokeCertificationAction } from "../../../actions";

type Role = "PREPARED" | "REVIEWED" | "APPROVED";
interface Block {
  role: Role;
  name: string | null;
  title: string | null;
  at: string | null;
  signature: string | null;
  canSign: boolean;
}

export function CertificationView({
  submissionId,
  agency,
  actorTitle,
  blocks,
  hr,
  stamp,
}: {
  submissionId: string;
  agency: string;
  actorTitle: string | null;
  blocks: Block[];
  hr: { name: string | null; at: string | null; canSign: boolean };
  stamp: { id: string; fileName: string } | null;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(actorTitle ?? "");
  const signed = blocks.filter((b) => b.at).length;
  const status = signed === 3 ? "fullyCertified" : signed > 0 ? "partiallyCertified" : "notCertified";
  const label: Record<Role, string> = { PREPARED: t("certification.preparedBy"), REVIEWED: t("certification.reviewedBy"), APPROVED: t("certification.approvedBy") };

  const sign = (role: Role | "HR") =>
    start(async () => {
      if (handleResult(await certifyAction(submissionId, role, title || null))) {
        toast.success(t("common.saved"));
        router.refresh();
      }
    });
  const revoke = async (role: Role | "HR") => {
    if (handleResult(await revokeCertificationAction(submissionId, role))) router.refresh();
  };

  return (
    <section className="space-y-5" aria-labelledby="cert-title">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="cert-title" className="text-lg font-semibold">
              {t("certification.title")}
            </h2>
            <p className="text-xs text-muted-foreground italic">BAYAANKA XAQIIJINTA</p>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", status === "fullyCertified" ? "bg-success/10 text-success ring-success/25" : status === "partiallyCertified" ? "bg-warning/15 text-warning-foreground ring-warning/40 dark:text-warning" : "bg-muted text-muted-foreground ring-border")}>
            {status === "fullyCertified" ? <BadgeCheck className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
            {t(`certification.${status}`)} ({signed}/3)
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm">{t("certification.statement")}</p>
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">{t("forms.agency")}:</span> <span className="font-medium">{agency}</span>
        </p>
        {blocks.some((b) => b.canSign && !b.at) ? (
          <div className="mt-3 max-w-sm space-y-1">
            <label htmlFor="cert-title-input" className="text-xs text-muted-foreground">
              {t("certification.signerTitle")}
            </label>
            <Input id="cert-title-input" className="h-8" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {blocks.map((b) => (
          <article key={b.role} className={cn("flex flex-col rounded-lg border bg-card p-4", b.at && "border-success/30")}>
            <h3 className="text-sm font-semibold">{label[b.role]}</h3>
            {b.at ? (
              <div className="mt-3 flex-1 space-y-1 text-sm">
                <p className="font-medium">{b.name}</p>
                {b.title ? <p className="text-muted-foreground">{b.title}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {t("common.date")}: {fmt.dateTime(b.at)}
                </p>
                <p className="mt-2 flex items-start gap-1.5 rounded-md bg-success/5 p-2 text-xs text-success">
                  <FileSignature className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="break-words">{b.signature}</span>
                </p>
              </div>
            ) : (
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{t("certification.notSigned")}</p>
            )}
            {b.canSign ? (
              <div className="mt-4">
                {b.at ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Undo2 aria-hidden />
                        {t("certification.withdraw")}
                      </Button>
                    }
                    title={t("certification.withdraw")}
                    description={label[b.role]}
                    onConfirm={() => revoke(b.role)}
                  />
                ) : (
                  <Button size="sm" disabled={pending} onClick={() => sign(b.role)}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileSignature aria-hidden />}
                    {t("certification.sign")}
                  </Button>
                )}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">{t("certification.hrCertifiedBy")}</h3>
          <p className="mt-2 text-sm">{hr.at ? `${hr.name} · ${fmt.dateTime(hr.at)}` : <span className="text-muted-foreground">{t("certification.notSigned")}</span>}</p>
          {hr.canSign ? (
            <div className="mt-3">
              {hr.at ? (
                <Button variant="ghost" size="sm" onClick={() => revoke("HR")}>
                  <Undo2 aria-hidden />
                  {t("certification.withdraw")}
                </Button>
              ) : (
                <Button size="sm" disabled={pending} onClick={() => sign("HR")}>
                  <FileSignature aria-hidden />
                  {t("certification.sign")}
                </Button>
              )}
            </div>
          ) : null}
        </article>
        <article className="rounded-lg border bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Stamp className="size-4" aria-hidden />
            {t("certification.officialStamp")}
          </h3>
          <p className="mt-2 text-sm">
            {stamp ? (
              <a className="text-primary hover:underline" href={`/api/attachments/${stamp.id}`}>
                {stamp.fileName}
              </a>
            ) : (
              <span className="text-muted-foreground">{t("certification.notSigned")}</span>
            )}
          </p>
          <Button variant="link" size="sm" className="mt-1 px-0" asChild>
            <Link href={`/budget/workspace/${submissionId}/attachments`}>{t("budget.attachments")}</Link>
          </Button>
        </article>
      </div>
    </section>
  );
}

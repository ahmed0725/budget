"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2, Paperclip, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FileUploader } from "@/components/app/file-uploader";
import { EmptyState } from "@/components/app/states";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { deleteAttachmentAction, uploadAttachmentAction } from "./actions";

const CATEGORIES = ["BUDGET_JUSTIFICATION", "PROJECT_PROPOSAL", "PROCUREMENT_DOCUMENT", "STAFFING_JUSTIFICATION", "APPROVAL_LETTER", "OFFICIAL_STAMP", "SIGNED_CERTIFICATION", "OTHER"] as const;
const FORMS = ["GENERAL", "A", "B", "C", "D", "E", "F", "G", "H", "CERTIFICATION"];

interface Item {
  id: string;
  fileName: string;
  category: string;
  form: string | null;
  section: string | null;
  description: string | null;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export function AttachmentsView({ submissionId, canUpload, canRemove, locked, allowed, maxSizeMb, items }: { submissionId: string; canUpload: boolean; canRemove: boolean; locked: boolean; allowed: string[]; maxSizeMb: number; items: Item[] }) {
  const { t } = useT();
  const fmt = useFormat();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(locked ? "APPROVAL_LETTER" : "BUDGET_JUSTIFICATION");
  const [form, setForm] = useState("GENERAL");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  const upload = () =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("submissionId", submissionId);
      fd.set("category", category);
      fd.set("form", form === "GENERAL" ? "" : form);
      fd.set("section", section);
      fd.set("description", description);
      if (handleResult(await uploadAttachmentAction(fd))) {
        toast.success(t("common.saved"));
        setFile(null);
        setSection("");
        setDescription("");
        router.refresh();
      }
    });

  const formLabel = (f: string | null) => (!f || f === "GENERAL" ? t("admin.general") : f === "CERTIFICATION" ? t("budget.certification") : t("budget.formLabel", { form: f }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <section aria-labelledby="att-title" className="space-y-3">
        <h2 id="att-title" className="text-lg font-semibold">
          {t("attachments.title")}
        </h2>
        {items.length === 0 ? (
          <EmptyState icon={Paperclip} title={t("attachments.empty")} />
        ) : (
          <div className="relative overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("attachments.file")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("attachments.category")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("attachments.relatedSection")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("attachments.size")}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t("attachments.uploadedBy")}</th>
                  <th scope="col" className="w-20 px-3 py-2">
                    <span className="sr-only">{t("common.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <a href={`/api/attachments/${a.id}`} className="font-medium text-primary hover:underline">
                        {a.fileName}
                      </a>
                      {a.description ? <p className="text-xs text-muted-foreground">{a.description}</p> : null}
                    </td>
                    <td className="px-3 py-2">{t(`attachments.${a.category}` as "attachments.OTHER")}</td>
                    <td className="px-3 py-2">
                      {formLabel(a.form)}
                      {a.section ? ` — ${a.section}` : ""}
                    </td>
                    <td className="num px-3 py-2 text-right">{(a.size / 1024).toFixed(0)} KB</td>
                    <td className="px-3 py-2">
                      {a.uploadedBy}
                      <p className="text-xs text-muted-foreground">{fmt.dateTime(a.uploadedAt)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <a href={`/api/attachments/${a.id}`} aria-label={`${t("common.download")} ${a.fileName}`}>
                            <Download aria-hidden />
                          </a>
                        </Button>
                        {canRemove ? (
                          <ConfirmDialog
                            destructive
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={`${t("common.remove")} ${a.fileName}`}>
                                <Trash2 aria-hidden />
                              </Button>
                            }
                            title={`${t("common.remove")}: ${a.fileName}`}
                            confirmLabel={t("common.remove")}
                            onConfirm={async () => {
                              if (handleResult(await deleteAttachmentAction(submissionId, a.id, "Removed from the attachments page"))) router.refresh();
                            }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canUpload ? (
        <aside className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="upload-title">
          <h2 id="upload-title" className="text-sm font-semibold">
            {t("attachments.uploadNew")}
          </h2>
          <FileUploader accept={allowed} maxSizeMb={maxSizeMb} file={file} onFile={setFile} disabled={pending} />
          <div className="space-y-1">
            <Label>{t("attachments.category")}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.filter((c) => !locked || c === "APPROVAL_LETTER").map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`attachments.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("workflow.correctionForm")}</Label>
              <Select value={form} onValueChange={setForm}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {formLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="att-section">{t("workflow.correctionSection")}</Label>
              <Input id="att-section" className="h-8" value={section} onChange={(e) => setSection(e.target.value)} maxLength={150} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-description">{t("common.description")}</Label>
            <Input id="att-description" className="h-8" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <Button className="w-full" disabled={!file || pending} onClick={upload}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
            {t("common.upload")}
          </Button>
        </aside>
      ) : null}
    </div>
  );
}

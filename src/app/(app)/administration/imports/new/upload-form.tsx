"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { FileUploader } from "@/components/app/file-uploader";
import { Button } from "@/components/ui/button";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { uploadImportAction } from "../actions";
import type { ProfileSummary } from "../profiles";

export function UploadForm({ profiles, initialProfile, maxSizeMb }: { profiles: ProfileSummary[]; initialProfile: string; maxSizeMb: number }) {
  const { t } = useT();
  const router = useRouter();
  const [profile, setProfile] = useState(profiles.some((p) => p.key === initialProfile) ? initialProfile : (profiles[0]?.key ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const current = profiles.find((p) => p.key === profile);
  const submit = () =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("profile", profile);
      fd.set("file", file);
      const res = handleResult(await uploadImportAction(fd));
      if (res) router.push(`/administration/imports/${res.id}`);
    });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">{t("imports.chooseType")}</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {profiles.map((p) => (
            <label
              key={p.key}
              className={cn("flex cursor-pointer gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", profile === p.key && "border-primary/60 bg-primary/5")}
            >
              <input
                type="radio"
                name="profile"
                value={p.key}
                checked={profile === p.key}
                onChange={() => {
                  setProfile(p.key);
                  if (file && !p.accepts.includes(file.name.split(".").pop()?.toLowerCase() ?? "")) setFile(null);
                }}
                className="mt-1 accent-[var(--primary)]"
              />
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{p.description}</span>
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground">{p.accepts.map((a) => `.${a}`).join(" ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <section className="space-y-3" aria-labelledby="choose-file">
        <h2 id="choose-file" className="text-sm font-semibold">
          {t("imports.chooseFile")}
        </h2>
        <FileUploader accept={current?.accepts ?? ["xlsx"]} maxSizeMb={maxSizeMb} file={file} onFile={setFile} disabled={pending} hint={t("imports.fileTypes", { size: maxSizeMb }).replace(".xlsx, .csv", (current?.accepts ?? []).map((a) => `.${a}`).join(", "))} />
        <Button className="w-full" onClick={submit} disabled={!file || !profile || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {t("imports.uploadAndDetect")}
        </Button>
      </section>
    </div>
  );
}

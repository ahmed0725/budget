"use client";

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Drag-and-drop file picker with client-side type/size pre-checks (the server re-validates). */
export function FileUploader({
  accept,
  maxSizeMb,
  file,
  onFile,
  disabled,
  hint,
}: {
  accept: string[];
  maxSizeMb: number;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return onFile(null);
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!accept.includes(ext)) {
      setError(`.${ext} — ${accept.map((a) => `.${a}`).join(", ")}`);
      return onFile(null);
    }
    if (f.size > maxSizeMb * 1024 * 1024) {
      setError(`> ${maxSizeMb} MB`);
      return onFile(null);
    }
    onFile(f);
  };

  return (
    <div className="space-y-1">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          drag ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <FileUp className="size-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{t("imports.dropFile")}</span>
        <span className="text-xs text-muted-foreground">{hint ?? t("imports.fileTypes", { size: maxSizeMb })}</span>
        <input ref={input} type="file" className="sr-only" accept={accept.map((a) => `.${a}`).join(",")} onChange={(e) => pick(e.target.files?.[0])} tabIndex={-1} />
      </div>
      {file ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
          <span className="truncate">
            {file.name} <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
          </span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t("common.remove")} onClick={() => pick(null)}>
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

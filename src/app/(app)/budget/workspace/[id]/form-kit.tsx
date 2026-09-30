"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { handleResult, type ClientActionResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { saveFormAction } from "../../actions";
import { WORKSPACE_TABS } from "./workspace-tabs";

// ─────────────────────────────────────────────────────────────────────────────
// Unsaved-changes guard
// ─────────────────────────────────────────────────────────────────────────────

export function useUnsavedChangesGuard(dirty: boolean) {
  const { t } = useT();
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.hasAttribute("download") || href.startsWith("/api/")) return;
      if (!window.confirm(t("common.unsavedChanges"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, t]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Saving with optimistic concurrency
// ─────────────────────────────────────────────────────────────────────────────

type FormKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export function useFormSave(form: FormKey, submissionId: string, initialRevision: string) {
  const { t } = useT();
  const router = useRouter();
  const revision = useRef(initialRevision);
  useEffect(() => {
    revision.current = initialRevision;
  }, [initialRevision]);
  const [pending, start] = useTransition();

  const save = useCallback(
    (values: unknown, opts: { then?: () => void; onSaved?: () => void } = {}) =>
      start(async () => {
        const result = (await saveFormAction(form, submissionId, values, revision.current)) as ClientActionResult<{ updatedAt: string }>;
        const data = handleResult(result);
        if (!data) {
          if (!result.ok && result.error.code === "BUSINESS_RULE" && /changed by another user/.test(result.error.message)) {
            toast.info(t("budget.concurrencyHint"));
          }
          return;
        }
        revision.current = data.updatedAt;
        toast.success(t("common.saved"));
        opts.onSaved?.();
        if (opts.then) opts.then();
        else router.refresh();
      }),
    [form, submissionId, router, t],
  );
  return { save, pending, getRevision: () => revision.current };
}

// ─────────────────────────────────────────────────────────────────────────────
// Form shell
// ─────────────────────────────────────────────────────────────────────────────

export function FormShell({
  form,
  submissionId,
  title,
  subtitle,
  description,
  completion,
  canEdit,
  dirty,
  saving,
  onSave,
  children,
  extraActions,
}: {
  form: FormKey;
  submissionId: string;
  title: string;
  subtitle?: string;
  description?: React.ReactNode;
  completion?: number;
  canEdit: boolean;
  dirty: boolean;
  saving: boolean;
  onSave?: (andContinue: boolean) => void;
  children: React.ReactNode;
  extraActions?: React.ReactNode;
}) {
  const { t } = useT();
  useUnsavedChangesGuard(dirty);
  const index = WORKSPACE_TABS.indexOf(form.toLowerCase() as "a");
  const prev = index > 0 ? WORKSPACE_TABS[index - 1] : null;
  const next = WORKSPACE_TABS[index + 1];
  const base = `/budget/workspace/${submissionId}`;
  return (
    <section aria-labelledby={`form-${form}-title`} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={`form-${form}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-muted-foreground italic">{subtitle}</p> : null}
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground dark:text-warning">{t("common.unsavedBadge")}</span> : null}
          {completion !== undefined ? (
            <span className="text-xs text-muted-foreground">
              {t("budget.completion")}: <span className="num font-medium text-foreground">{completion}%</span>
            </span>
          ) : null}
          {extraActions}
        </div>
      </div>
      {children}
      <div className="no-print sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-2">
          {prev ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/${prev}`}>
                <ChevronLeft aria-hidden />
                {t("common.previous")}
              </Link>
            </Button>
          ) : null}
          {next ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/${next}`}>
                {t("common.next")}
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
        {canEdit && onSave ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={saving || !dirty} onClick={() => onSave(false)}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {t("common.saveDraft")}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => onSave(true)}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("common.saveContinue")}
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function nextTabHref(submissionId: string, form: FormKey) {
  const index = WORKSPACE_TABS.indexOf(form.toLowerCase() as "a");
  return `/budget/workspace/${submissionId}/${WORKSPACE_TABS[index + 1] ?? "validation"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money input
// ─────────────────────────────────────────────────────────────────────────────

function formatInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Amount input: shows thousands separators when not focused; stores a plain number string. */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string | number | null | undefined; onValueChange: (v: string) => void; invalid?: boolean }
>(function MoneyInput({ value, onValueChange, invalid, className, onFocus, onBlur, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const raw = value === null || value === undefined ? "" : String(value);
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || undefined}
      className={cn("num h-8 text-right", className)}
      value={focused ? raw : formatInput(raw)}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => onValueChange(e.target.value.replace(/[^0-9.,-]/g, "").replace(/,/g, ""))}
      {...props}
    />
  );
});

export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification code picker
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeOption {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  categoryId: string | null;
}

export function CodePicker({
  codes,
  value,
  onChange,
  disabled,
  excludeIds,
  invalid,
  placeholder,
}: {
  codes: CodeOption[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
  excludeIds?: Set<string>;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const selected = codes.find((c) => c.id === value);
  const label = (c: CodeOption) => (locale === "en" && c.nameEn ? c.nameEn : c.name);
  const options = useMemo(() => codes.filter((c) => c.id === value || !excludeIds?.has(c.id)), [codes, excludeIds, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="h-8 w-full justify-between px-2 font-normal"
        >
          <span className="truncate text-left">
            {selected ? (
              <>
                <span className="num font-medium">{selected.code}</span> <span className="text-muted-foreground">{label(selected)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder ?? t("budget.selectCode")}</span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={t("common.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.code} ${c.name} ${c.nameEn ?? ""}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="num w-16 shrink-0 font-medium">{c.code}</span>
                  <span className="truncate">{label(c)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

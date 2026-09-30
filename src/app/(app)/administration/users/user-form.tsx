"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, Loader2, LockOpen, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CheckboxList, Field, SelectField, SwitchField, TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { userSchema, type UserInput } from "@/lib/validations/admin";
import { resetPasswordAction, saveUserAction, unlockUserAction } from "../actions";

type AssignmentType = UserInput["assignments"][number]["type"];
const TYPES: AssignmentType[] = ["BUDGET_OFFICER", "FINANCE_OFFICER", "ACCOUNTING_OFFICER", "REVIEWER", "VIEWER"];
const TYPE_LABEL: Record<AssignmentType, { en: string; so: string }> = {
  BUDGET_OFFICER: { en: "Budget officer", so: "Sarkaalka miisaaniyadda" },
  FINANCE_OFFICER: { en: "Finance officer", so: "Sarkaalka maaliyadda" },
  ACCOUNTING_OFFICER: { en: "Accounting officer", so: "Mas'uulka xisaab-celinta" },
  REVIEWER: { en: "Ministry reviewer", so: "Dib-u-eegaha wasaaradda" },
  VIEWER: { en: "Viewer", so: "Daawade" },
};

export interface UserFormOptions {
  roles: { value: string; label: string; hint?: string }[];
  mdas: { value: string; label: string }[];
}

export function UserForm({ userId, defaults, options }: { userId?: string; defaults?: UserInput; options: UserFormOptions }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [password, setPassword] = useState<{ value: string; newId: string | null } | null>(null);
  const form = useForm<UserInput>({
    resolver: zodResolver(userSchema) as never,
    defaultValues: defaults ?? { fullName: "", username: "", email: "", jobTitle: null, phone: null, locale: "en", isActive: true, roleIds: [], assignments: [] },
  });
  const assignments = useFieldArray({ control: form.control, name: "assignments" });
  const [draft, setDraft] = useState<{ mdaId: string; type: AssignmentType }>({ mdaId: "", type: "BUDGET_OFFICER" });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    const res = handleResult(await saveUserAction(userId ?? null, values), t("common.saved"));
    if (!res) return;
    if (res.temporaryPassword) setPassword({ value: res.temporaryPassword, newId: res.id });
    else router.refresh();
  });
  const mdaLabel = (id: string) => options.mdas.find((m) => m.value === id)?.label ?? id;

  return (
    <>
      <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="u-account">
          <h2 id="u-account" className="text-sm font-semibold">
            {t("admin.account")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField register={form.register} name="fullName" label={t("common.name")} required error={e.fullName?.message} className="sm:col-span-2" />
            <TextField register={form.register} name="username" label={t("admin.username")} required error={e.username?.message} />
            <TextField register={form.register} name="email" label={t("forms.email")} type="email" required error={e.email?.message} />
            <TextField register={form.register} name="jobTitle" label={t("admin.jobTitle")} error={e.jobTitle?.message} />
            <TextField register={form.register} name="phone" label={t("forms.telephone")} type="tel" error={e.phone?.message} />
            <SelectField
              control={form.control}
              name="locale"
              label={t("admin.preferredLanguage")}
              options={[
                { value: "en", label: t("common.english") },
                { value: "so", label: t("common.somali") },
              ]}
            />
            <div className="flex items-end pb-1">
              <SwitchField control={form.control} name="isActive" label={t("common.active")} />
            </div>
          </div>
        </section>
        <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="u-roles">
          <h2 id="u-roles" className="text-sm font-semibold">
            {t("admin.roles")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("admin.rolesHint")}</p>
          <Controller control={form.control} name="roleIds" render={({ field }) => <CheckboxList options={options.roles} value={field.value} onChange={field.onChange} />} />
          {e.roleIds?.message ? (
            <p role="alert" className="text-xs text-destructive">
              {e.roleIds.message}
            </p>
          ) : null}
        </section>
        <section className="space-y-3 rounded-lg border bg-card p-4 xl:col-span-2" aria-labelledby="u-mdas">
          <h2 id="u-mdas" className="text-sm font-semibold">
            {t("admin.assignments")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("admin.assignmentsHint")}</p>
          <ul className="divide-y rounded-md border text-sm">
            {assignments.fields.length === 0 ? <li className="px-3 py-2 text-muted-foreground">—</li> : null}
            {assignments.fields.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span>
                  {mdaLabel(a.mdaId)} <span className="text-xs text-muted-foreground">· {TYPE_LABEL[a.type][locale]}</span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => assignments.remove(i)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={draft.mdaId} onValueChange={(v) => setDraft({ ...draft, mdaId: v })}>
              <SelectTrigger className="w-full sm:flex-1" aria-label={t("common.mda")}>
                <SelectValue placeholder={t("common.mda")} />
              </SelectTrigger>
              <SelectContent>
                {options.mdas.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as AssignmentType })}>
              <SelectTrigger className="w-full sm:w-56" aria-label={t("admin.assignmentType")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {TYPE_LABEL[ty][locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={!draft.mdaId || assignments.fields.some((a) => a.mdaId === draft.mdaId && a.type === draft.type)}
              onClick={() => {
                assignments.append({ mdaId: draft.mdaId, type: draft.type });
                setDraft({ ...draft, mdaId: "" });
              }}
            >
              <Plus aria-hidden />
              {t("common.add")}
            </Button>
          </div>
        </section>
        <div className="flex justify-end gap-2 xl:col-span-2">
          <Button type="button" variant="outline" onClick={() => router.push("/administration/users")}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {userId ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
      <TemporaryPasswordDialog
        password={password?.value ?? null}
        onClose={() => {
          const target = password?.newId;
          setPassword(null);
          if (target) router.push(`/administration/users/${target}`);
          else router.refresh();
        }}
      />
    </>
  );
}

/** Shows a generated temporary password exactly once. */
export function TemporaryPasswordDialog({ password, onClose }: { password: string | null; onClose: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={password !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.temporaryPassword")}</DialogTitle>
          <DialogDescription>{t("admin.temporaryPasswordHint")}</DialogDescription>
        </DialogHeader>
        <Field id="temp-password" label={t("admin.temporaryPassword")}>
          <div className="flex gap-2">
            <Input id="temp-password" readOnly value={password ?? ""} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(password ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard unavailable: the field is selectable */
                }
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? t("admin.copied") : t("admin.copy")}
            </Button>
          </div>
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserAccountActions({ userId, locked }: { userId: string; locked: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [password, setPassword] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {locked ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (handleResult(await unlockUserAction(userId), t("common.saved"))) router.refresh();
            })
          }
        >
          <LockOpen aria-hidden />
          {t("admin.unlock")}
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm">
            <KeyRound aria-hidden />
            {t("admin.resetPassword")}
          </Button>
        }
        title={t("admin.resetPassword")}
        description={t("admin.resetPasswordConfirm")}
        onConfirm={async () => {
          const res = handleResult(await resetPasswordAction(userId));
          if (res) setPassword(res.temporaryPassword);
        }}
      />
      <TemporaryPasswordDialog
        password={password}
        onClose={() => {
          setPassword(null);
          router.refresh();
        }}
      />
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Loader2, LogOut, Save } from "lucide-react";
import { Field } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { changePasswordAction, signOutOtherSessionsAction, updateProfileAction } from "./actions";

export function PreferencesForm({ phone, locale }: { phone: string | null; locale: "en" | "so" }) {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState({ phone: phone ?? "", locale });
  const [pending, start] = useTransition();
  const dirty = state.phone !== (phone ?? "") || state.locale !== locale;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (handleResult(await updateProfileAction(state), t("common.saved"))) router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="p-phone" label={t("forms.telephone")}>
          <Input id="p-phone" type="tel" value={state.phone} onChange={(e) => setState({ ...state, phone: e.target.value })} />
        </Field>
        <Field id="p-locale" label={t("admin.preferredLanguage")}>
          <Select value={state.locale} onValueChange={(v) => setState({ ...state, locale: v as "en" | "so" })}>
            <SelectTrigger id="p-locale" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("common.english")}</SelectItem>
              <SelectItem value="so">{t("common.somali")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm({ minLength, required }: { minLength: number; required: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };
  const [state, setState] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const field = (key: keyof typeof empty, label: string, autoComplete: string) => (
    <Field id={`pw-${key}`} label={label} required error={errors[key]?.[0]}>
      <Input id={`pw-${key}`} type="password" autoComplete={autoComplete} value={state[key]} aria-invalid={Boolean(errors[key])} onChange={(e) => setState({ ...state, [key]: e.target.value })} />
    </Field>
  );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changePasswordAction(state);
          setErrors(res.ok ? {} : (res.error.fieldErrors ?? {}));
          if (handleResult(res)) {
            setState(empty);
            router.replace("/profile");
            router.refresh();
          }
        });
      }}
    >
      {required ? (
        <p role="alert" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          {t("auth.mustChangePassword")}
        </p>
      ) : null}
      {field("currentPassword", t("profile.currentPassword"), "current-password")}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("newPassword", t("profile.newPassword"), "new-password")}
        {field("confirmPassword", t("profile.confirmPassword"), "new-password")}
      </div>
      <p className="text-xs text-muted-foreground">{t("profile.passwordRules", { min: minLength })}</p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !state.currentPassword || !state.newPassword}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          {t("auth.changePassword")}
        </Button>
      </div>
    </form>
  );
}

export function SignOutOthersButton({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = handleResult(await signOutOtherSessionsAction());
          if (res) router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      {t("profile.signOutOthers")}
    </Button>
  );
}

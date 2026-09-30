"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import { formASchema, type FormAInput } from "@/lib/validations/budget";
import { FieldError, FormShell, nextTabHref, useFormSave } from "../form-kit";

export function FormA({ submissionId, revision, canEdit, completion, agency, defaults }: { submissionId: string; revision: string; canEdit: boolean; completion: number; agency: string; defaults: FormAInput }) {
  const { t } = useT();
  const router = useRouter();
  const form = useForm<FormAInput>({ resolver: zodResolver(formASchema), defaultValues: defaults, mode: "onBlur" });
  const { save, pending } = useFormSave("A", submissionId, revision);
  const errors = form.formState.errors;

  const onSave = (andContinue: boolean) =>
    form.handleSubmit((values) =>
      save(values, { onSaved: () => form.reset(values), then: andContinue ? () => router.push(nextTabHref(submissionId, "A")) : undefined }),
    )();

  const fields: { name: keyof FormAInput; label: string; type?: string; autoComplete?: string }[] = [
    { name: "allocationNumber", label: t("forms.allocationNumber") },
    { name: "agencyCategory", label: t("forms.agencyCategory") },
    { name: "accountingOfficer", label: t("forms.accountingOfficer"), autoComplete: "name" },
    { name: "contactPerson", label: t("forms.contactPerson"), autoComplete: "name" },
    { name: "telephone", label: t("forms.telephone"), type: "tel", autoComplete: "tel" },
    { name: "email", label: t("forms.email"), type: "email", autoComplete: "email" },
  ];

  return (
    <FormShell
      form="A"
      submissionId={submissionId}
      title={t("forms.A.title")}
      subtitle={`FOOM A — ${t("forms.A.so").toUpperCase()}`}
      completion={completion}
      canEdit={canEdit}
      dirty={form.formState.isDirty}
      saving={pending}
      onSave={onSave}
    >
      <form
        className="rounded-lg border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(false);
        }}
        noValidate
      >
        <div className="grid border-b px-4 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <span className="text-sm text-muted-foreground">{t("forms.agency")}</span>
          <span className="font-medium">{agency}</span>
        </div>
        {fields.map((f) => (
          <div key={f.name} className="grid gap-1 border-b px-4 py-3 last:border-0 sm:grid-cols-[14rem_1fr] sm:items-start">
            <Label htmlFor={`a-${f.name}`} className="pt-2 text-sm text-muted-foreground">
              {f.label} <span className="text-destructive">*</span>
            </Label>
            <div>
              <Input id={`a-${f.name}`} type={f.type ?? "text"} autoComplete={f.autoComplete} readOnly={!canEdit} aria-invalid={Boolean(errors[f.name])} className="max-w-xl" {...form.register(f.name)} />
              <FieldError message={errors[f.name]?.message} />
            </div>
          </div>
        ))}
        <button type="submit" hidden />
      </form>
    </FormShell>
  );
}

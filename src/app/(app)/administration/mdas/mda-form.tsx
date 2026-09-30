"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { SelectField, TextField } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { mdaSchema, type MdaInput } from "@/lib/validations/admin";
import { saveMdaAction } from "../actions";

export interface MdaFormOptions {
  sectors: { value: string; label: string }[];
  agencyTypes: { value: string; label: string }[];
  regions: { value: string; label: string }[];
  categories: { value: string; label: string }[];
  parents: { value: string; label: string }[];
}

export function MdaFormDialog({ mdaId, defaults, options }: { mdaId?: string; defaults?: Partial<MdaInput>; options: MdaFormOptions }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<MdaInput>({ resolver: zodResolver(mdaSchema) as never, defaultValues: { code: "", name: "", sectorId: "", ...defaults } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    const res = handleResult(await saveMdaAction(mdaId ?? null, values), t("common.saved"));
    if (res) {
      setOpen(false);
      if (!mdaId) router.push(`/administration/mdas/${res.id}`);
      else router.refresh();
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ code: "", name: "", sectorId: "", ...defaults });
      }}
    >
      <DialogTrigger asChild>
        {mdaId ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden />
            {t("common.edit")}
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden />
            {t("admin.newMda")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mdaId ? t("admin.editMda") : t("admin.newMda")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField register={form.register} name="code" label={t("common.code")} required error={e.code?.message} hint="e.g. 10101" />
              <SelectField control={form.control} name="sectorId" label={t("common.sector")} options={options.sectors} required error={e.sectorId?.message} />
              <TextField register={form.register} name="name" label={t("admin.officialName")} required error={e.name?.message} className="sm:col-span-2" />
              <TextField register={form.register} name="nameEn" label={t("admin.englishName")} error={e.nameEn?.message} />
              <TextField register={form.register} name="shortName" label={t("admin.shortName")} error={e.shortName?.message} />
              <SelectField control={form.control} name="agencyTypeId" label={t("admin.agencyType")} options={options.agencyTypes} allowEmpty />
              <SelectField control={form.control} name="categoryId" label={t("admin.mdaCategory")} options={options.categories} allowEmpty />
              <SelectField control={form.control} name="regionId" label={t("common.region")} options={options.regions} allowEmpty />
              <SelectField control={form.control} name="parentId" label={t("admin.parentMda")} options={options.parents.filter((p) => p.value !== mdaId)} allowEmpty />
              <TextField register={form.register} name="accountingOfficer" label={t("forms.accountingOfficer")} error={e.accountingOfficer?.message} />
              <TextField register={form.register} name="financeDirector" label={t("admin.financeDirector")} error={e.financeDirector?.message} />
              <TextField register={form.register} name="budgetOfficer" label={t("admin.budgetOfficer")} error={e.budgetOfficer?.message} />
              <TextField register={form.register} name="contactPerson" label={t("forms.contactPerson")} error={e.contactPerson?.message} />
              <TextField register={form.register} name="phone" label={t("forms.telephone")} type="tel" error={e.phone?.message} />
              <TextField register={form.register} name="email" label={t("forms.email")} type="email" error={e.email?.message} />
              <TextField register={form.register} name="address" label={t("admin.address")} error={e.address?.message} className="sm:col-span-2" />
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

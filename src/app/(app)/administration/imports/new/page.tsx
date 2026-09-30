import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { MAX_IMPORT_MB } from "@/lib/services/imports";
import { ImportStepper } from "../stepper";
import { profileSummaries } from "../profiles";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage(props: PageProps<"/administration/imports/new">) {
  const actor = await requirePagePermission("import.run", "execution.manage", "admin.codes.manage");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const profiles = profileSummaries(actor, locale);
  return (
    <div className="space-y-6">
      <PageHeader title={t("imports.newImport")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.imports"), href: "/administration/imports" }, { label: t("imports.newImport") }]} />
      <ImportStepper current="upload" />
      <UploadForm profiles={profiles} initialProfile={param(sp, "profile") ?? profiles[0]?.key ?? ""} maxSizeMb={MAX_IMPORT_MB} />
    </div>
  );
}

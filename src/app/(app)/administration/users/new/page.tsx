import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { userFormOptions } from "../options";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  await requirePagePermission("admin.users.manage");
  const { t, locale } = await getT();
  return (
    <div>
      <PageHeader title={t("admin.newUser")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.users"), href: "/administration/users" }, { label: t("admin.newUser") }]} />
      <UserForm options={await userFormOptions(locale)} />
    </div>
  );
}

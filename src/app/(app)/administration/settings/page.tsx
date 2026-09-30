import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/actor";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils";
import { CategoriesEditor, LookupsEditor, RulesEditor, SettingForm } from "./settings-client";

export const metadata: Metadata = { title: "System settings" };

const TABS = ["general", "security", "budget", "attachments", "lookups", "rules", "categories"] as const;
type Tab = (typeof TABS)[number];
const LOOKUP_CATEGORIES = ["AGENCY_TYPE", "REGION", "MDA_CATEGORY", "FUNDING_SOURCE", "PROCUREMENT_METHOD"] as const;
const LOOKUP_LABEL: Record<(typeof LOOKUP_CATEGORIES)[number], { en: string; so: string }> = {
  AGENCY_TYPE: { en: "Agency types", so: "Noocyada hay'adaha" },
  REGION: { en: "Regions", so: "Gobollada" },
  MDA_CATEGORY: { en: "MDA categories", so: "Qaybaha hay'adaha" },
  FUNDING_SOURCE: { en: "Funding sources", so: "Ilaha maalgelinta" },
  PROCUREMENT_METHOD: { en: "Procurement methods", so: "Hababka iibsiga" },
};

export default async function SettingsPage(props: PageProps<"/administration/settings">) {
  const actor = await requirePagePermission("admin.settings.manage", "admin.validation.manage");
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const canSettings = can(actor, "admin.settings.manage");
  const available = TABS.filter((tab) => (tab === "rules" ? can(actor, "admin.validation.manage") : tab === "categories" ? canSettings || can(actor, "admin.codes.manage") : canSettings));
  const requested = param(sp, "tab") as Tab | undefined;
  const tab: Tab = requested && available.includes(requested) ? requested : available[0];
  const settings = await getSettings();
  const labels: Record<Tab, string> = {
    general: t("admin.general"),
    security: t("admin.security"),
    budget: t("admin.budgetRules"),
    attachments: t("admin.attachmentsSettings"),
    lookups: t("admin.lookups"),
    rules: t("admin.validationRules"),
    categories: t("admin.categories"),
  };

  let body: React.ReactNode = null;
  if (tab === "general") {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone").filter((z) => z.startsWith("Africa/") || z === "UTC") : ["Africa/Mogadishu", "UTC"];
    body = (
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingForm
          settingKey="organization"
          title={t("admin.organization")}
          description="Printed on official forms, reports and exports."
          value={settings.organization}
          fields={[
            { key: "governmentName", label: "Government (Somali)", type: "text", wide: true },
            { key: "governmentNameEn", label: "Government (English)", type: "text", wide: true },
            { key: "ministryName", label: "Ministry (Somali)", type: "text" },
            { key: "ministryNameEn", label: "Ministry (English)", type: "text" },
            { key: "departmentName", label: "Department (Somali)", type: "text" },
            { key: "departmentNameEn", label: "Department (English)", type: "text" },
          ]}
        />
        <div className="space-y-4">
          <SettingForm
            settingKey="currency"
            title={t("common.currency")}
            value={settings.currency}
            fields={[
              { key: "code", label: t("admin.currencyCode"), type: "text" },
              { key: "symbol", label: t("admin.currencySymbol"), type: "text" },
              { key: "name", label: t("admin.currencyName"), type: "text" },
              { key: "decimals", label: t("admin.decimals"), type: "number" },
            ]}
          />
          <SettingForm settingKey="timezone" title={t("admin.timezone")} value={settings.timezone} fields={[{ key: "value", label: t("admin.timezone"), type: "select", options: zones.map((z) => ({ value: z, label: z })), wide: true }]} />
          <SettingForm
            settingKey="defaultLocale"
            title={t("admin.defaultLocale")}
            value={settings.defaultLocale}
            fields={[
              {
                key: "value",
                label: t("admin.defaultLocale"),
                type: "select",
                wide: true,
                options: [
                  { value: "en", label: t("common.english") },
                  { value: "so", label: t("common.somali") },
                ],
              },
            ]}
          />
        </div>
      </div>
    );
  } else if (tab === "security") {
    body = (
      <SettingForm
        settingKey="security"
        title={t("admin.security")}
        value={settings.security}
        fields={[
          { key: "sessionHours", label: t("admin.sessionHours"), type: "number" },
          { key: "idleTimeoutMinutes", label: t("admin.idleTimeout"), type: "number" },
          { key: "maxFailedLogins", label: t("admin.maxFailedLogins"), type: "number" },
          { key: "lockoutMinutes", label: t("admin.lockoutMinutes"), type: "number" },
          { key: "passwordMinLength", label: t("admin.passwordMinLength"), type: "number" },
        ]}
      />
    );
  } else if (tab === "budget") {
    body = (
      <SettingForm
        settingKey="budget"
        title={t("admin.budgetRules")}
        value={settings.budget}
        fields={[
          { key: "requireFullCertification", label: t("admin.requireFullCertification"), type: "boolean" },
          { key: "deadlineReminderDays", label: t("admin.deadlineReminderDays"), type: "number" },
          { key: "largeVariancePercent", label: t("admin.largeVariancePercent"), type: "number" },
          { key: "revenueAlertPercent", label: t("admin.revenueAlertPercent"), type: "number" },
        ]}
      />
    );
  } else if (tab === "attachments") {
    body = (
      <SettingForm
        settingKey="attachments"
        title={t("admin.attachmentsSettings")}
        value={settings.attachments}
        fields={[
          { key: "maxSizeMb", label: t("admin.maxSize"), type: "number" },
          { key: "allowedExtensions", label: t("admin.allowedExtensions"), type: "multi", options: ["pdf", "docx", "doc", "xlsx", "xls", "csv", "png", "jpg", "jpeg"].map((x) => ({ value: x, label: `.${x}` })) },
        ]}
      />
    );
  } else if (tab === "lookups") {
    const list = (LOOKUP_CATEGORIES as readonly string[]).includes(param(sp, "list") ?? "") ? (param(sp, "list") as (typeof LOOKUP_CATEGORIES)[number]) : "AGENCY_TYPE";
    const rows = await prisma.lookupValue.findMany({ where: { category: list }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    body = (
      <LookupsEditor
        category={list}
        categories={LOOKUP_CATEGORIES.map((c) => ({ value: c, label: LOOKUP_LABEL[c][locale] }))}
        rows={rows.map((r) => ({ id: r.id, category: r.category, code: r.code, name: r.name, nameEn: r.nameEn, sortOrder: r.sortOrder, isActive: r.isActive }))}
      />
    );
  } else if (tab === "rules") {
    const rules = await prisma.validationRule.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    body = (
      <RulesEditor
        canEdit={can(actor, "admin.validation.manage")}
        rows={rules.map((r) => {
          const params = (r.params ?? {}) as { thresholdPercent?: number };
          return {
            code: r.code,
            name: locale === "so" ? r.nameSo : r.name,
            description: r.description,
            form: r.form,
            severity: r.severity,
            isActive: r.isActive,
            tolerance: Number(r.tolerance),
            thresholdPercent: typeof params.thresholdPercent === "number" ? params.thresholdPercent : null,
          };
        })}
      />
    );
  } else if (tab === "categories") {
    const cats = await prisma.budgetCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], include: { _count: { select: { codes: true } } } });
    body = (
      <CategoriesEditor
        canEdit={can(actor, "admin.codes.manage")}
        rows={cats.map((c) => ({ id: c.id, code: c.code, kind: c.kind, summaryGroup: c.summaryGroup, isCapital: c.isCapital, name: c.name, nameSo: c.nameSo, procurementEligible: c.procurementEligible, isActive: c.isActive, sortOrder: c.sortOrder, codes: c._count.codes }))}
      />
    );
  }

  return (
    <div>
      <PageHeader title={t("nav.settings")} breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.settings") }]} />
      <nav className="-mx-1 mb-5 overflow-x-auto border-b" aria-label={t("nav.settings")}>
        <ul className="flex min-w-max gap-1 px-1">
          {available.map((key) => (
            <li key={key}>
              <Link
                href={`/administration/settings?tab=${key}`}
                aria-current={key === tab ? "page" : undefined}
                className={cn("inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground", key === tab && "border-primary font-medium text-foreground")}
              >
                {labels[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { requirePagePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";
import { MdaFormDialog } from "../mda-form";
import { mdaFormOptions } from "../options";
import { AssignmentsEditor, MdaActiveToggle } from "./mda-detail-client";

export default async function MdaDetailPage(props: PageProps<"/administration/mdas/[id]">) {
  await requirePagePermission("admin.mda.manage");
  const { id } = await props.params;
  const { t, locale } = await getT();
  const settings = await getSettings();
  const mda = await prisma.mda.findUnique({
    where: { id },
    include: {
      sector: true,
      agencyType: true,
      region: true,
      category: true,
      parent: { select: { code: true, name: true } },
      assignments: { include: { user: { select: { id: true, fullName: true, email: true, isActive: true } } } },
      submissions: { include: { budgetYear: { select: { year: true } } }, orderBy: [{ budgetYear: { year: "desc" } }, { revisionNumber: "desc" }] },
    },
  });
  if (!mda || mda.deletedAt) notFound();
  const [options, users] = await Promise.all([mdaFormOptions(locale), prisma.user.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, email: true } })]);
  const label = (x: { name: string; nameEn?: string | null } | null) => (x ? (locale === "en" && x.nameEn ? x.nameEn : x.name) : "—");
  const money = (v: unknown) => formatMoney(Number(v), { currencySymbol: settings.currency.symbol });
  const info: [string, string | null][] = [
    [t("common.code"), mda.code],
    [t("admin.officialName"), mda.name],
    [t("admin.englishName"), mda.nameEn],
    [t("common.sector"), `${mda.sector.code} — ${label(mda.sector)}`],
    [t("admin.agencyType"), label(mda.agencyType)],
    [t("admin.mdaCategory"), label(mda.category)],
    [t("common.region"), label(mda.region)],
    [t("admin.parentMda"), mda.parent ? `${mda.parent.code} — ${mda.parent.name}` : "—"],
    [t("forms.accountingOfficer"), mda.accountingOfficer],
    [t("admin.financeDirector"), mda.financeDirector],
    [t("admin.budgetOfficer"), mda.budgetOfficer],
    [t("forms.contactPerson"), mda.contactPerson],
    [t("forms.telephone"), mda.phone],
    [t("forms.email"), mda.email],
    [t("admin.address"), mda.address],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${mda.code} — ${mda.name}`}
        description={mda.nameEn ?? undefined}
        badges={<StatusBadge status={mda.isActive ? "ACTIVE" : "CLOSED"} label={mda.isActive ? t("common.active") : t("common.inactive")} />}
        breadcrumbs={[{ label: t("nav.administration") }, { label: t("nav.mdas"), href: "/administration/mdas" }, { label: mda.code }]}
        actions={
          <>
            <MdaFormDialog
              mdaId={mda.id}
              options={options}
              defaults={{
                code: mda.code,
                name: mda.name,
                nameEn: mda.nameEn,
                shortName: mda.shortName,
                sectorId: mda.sectorId,
                parentId: mda.parentId,
                agencyTypeId: mda.agencyTypeId,
                regionId: mda.regionId,
                categoryId: mda.categoryId,
                accountingOfficer: mda.accountingOfficer,
                financeDirector: mda.financeDirector,
                budgetOfficer: mda.budgetOfficer,
                contactPerson: mda.contactPerson,
                phone: mda.phone,
                email: mda.email,
                address: mda.address,
              }}
            />
            <MdaActiveToggle mdaId={mda.id} isActive={mda.isActive} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border bg-card" aria-labelledby="mda-info">
          <h2 id="mda-info" className="border-b px-4 py-3 text-sm font-semibold">
            {t("admin.mdaDetails")}
          </h2>
          <dl className="divide-y text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[12rem_1fr] gap-2 px-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <AssignmentsEditor
          mdaId={mda.id}
          users={users.map((u) => ({ id: u.id, label: `${u.fullName} (${u.email})` }))}
          initial={mda.assignments.map((a) => ({ userId: a.userId, type: a.type, name: a.user.fullName, email: a.user.email }))}
        />
      </div>
      <section className="rounded-lg border bg-card" aria-labelledby="mda-history">
        <h2 id="mda-history" className="border-b px-4 py-3 text-sm font-semibold">
          {t("admin.budgetHistory")}
        </h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-4 py-2 text-left font-medium">{t("common.year")}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">{t("common.type")}</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">{t("common.status")}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t("dashboard.totalExpenditure")}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t("dashboard.totalRevenue")}</th>
              </tr>
            </thead>
            <tbody>
              {mda.submissions.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <Link href={`/budget/workspace/${s.id}`} className="num font-medium hover:underline">
                      {s.budgetYear.year}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.type === "REVISION" ? `${t("budget.revision")} ${s.revisionNumber}` : t("status.ORIGINAL")}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="num px-4 py-2 text-right">{money(s.totalExpenditure)}</td>
                  <td className="num px-4 py-2 text-right">{money(s.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

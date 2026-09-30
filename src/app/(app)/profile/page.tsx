import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { getSessionFlags, listOwnSessions, requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { param } from "@/lib/page-params";
import { getSettings } from "@/lib/services/settings";
import { ChangePasswordForm, PreferencesForm, SignOutOthersButton } from "./profile-forms";

export const metadata: Metadata = { title: "My profile" };

function browserOf(ua: string | null): string {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export default async function ProfilePage(props: PageProps<"/profile">) {
  const actor = await requireActor({ allowPendingPasswordChange: true });
  const { t, locale } = await getT();
  const sp = await props.searchParams;
  const [settings, flags, user, sessions] = await Promise.all([
    getSettings(),
    getSessionFlags(),
    prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: { roles: { include: { role: { select: { name: true, nameSo: true } } } }, mdaAssignments: { include: { mda: { select: { code: true, name: true, nameEn: true } } } } },
    }),
    listOwnSessions(actor.id),
  ]);
  const fmt = { locale, timezone: settings.timezone };
  const mustChange = Boolean(flags?.mustChangePassword) || param(sp, "changePassword") === "1";
  const info: [string, React.ReactNode][] = [
    [t("common.name"), user.fullName],
    [t("admin.username"), <span key="u" className="font-mono">{user.username}</span>],
    [t("forms.email"), user.email],
    [t("admin.jobTitle"), user.jobTitle ?? "—"],
    [t("admin.roles"), user.roles.map((r) => (locale === "so" && r.role.nameSo ? r.role.nameSo : r.role.name)).join(", ") || "—"],
    [t("nav.mdas"), user.mdaAssignments.length ? user.mdaAssignments.map((a) => `${a.mda.code} ${locale === "en" && a.mda.nameEn ? a.mda.nameEn : a.mda.name}`).join("; ") : actor.allMdas ? t("common.all") : "—"],
    [t("admin.lastLogin"), user.lastLoginAt ? formatDateTime(user.lastLoginAt, fmt) : "—"],
    [t("profile.passwordChanged"), user.passwordChangedAt ? formatDateTime(user.passwordChangedAt, fmt) : "—"],
  ];
  const section = "rounded-lg border bg-card";
  const heading = "border-b px-4 py-3 text-sm font-semibold";

  return (
    <div className="space-y-6">
      <PageHeader title={t("profile.title")} description={t("profile.description")} badges={user.isDevSeed ? <StatusBadge status="INFO" label={t("admin.devSeedAccount")} /> : null} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className={section} aria-labelledby="pr-password" id="change-password">
          <h2 id="pr-password" className={heading}>
            {t("auth.changePassword")}
          </h2>
          <div className="p-4">
            <ChangePasswordForm minLength={settings.security.passwordMinLength} required={mustChange} />
          </div>
        </section>
        <section className={section} aria-labelledby="pr-account">
          <h2 id="pr-account" className={heading}>
            {t("admin.account")}
          </h2>
          <dl className="divide-y text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[10rem_1fr] gap-2 px-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t p-4">
            <PreferencesForm phone={user.phone} locale={user.locale === "so" ? "so" : "en"} />
          </div>
        </section>
      </div>
      <section className={section} aria-labelledby="pr-sessions">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="pr-sessions" className="text-sm font-semibold">
            {t("profile.sessions")}
          </h2>
          <SignOutOthersButton disabled={sessions.filter((s) => !s.current).length === 0} />
        </div>
        <ul className="divide-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                {browserOf(s.userAgent)}
                {s.current ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">{t("profile.thisDevice")}</span> : null}
                <span className="block text-xs text-muted-foreground">{s.ip ?? "—"}</span>
              </span>
              <span className="num text-xs text-muted-foreground">
                {t("profile.lastActive")}: {formatDateTime(s.lastSeenAt, fmt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

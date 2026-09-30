import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landmark, ShieldCheck } from "lucide-react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getActor } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getActor()) redirect("/dashboard");
  const { t, locale } = await getT();
  const settings = await getSettings();
  const search = await props.searchParams;
  const next = typeof search.next === "string" ? search.next : undefined;
  const org = settings.organization;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
            <Landmark className="size-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{locale === "so" ? org.governmentName : org.governmentNameEn}</div>
            <div className="text-xs text-primary-foreground/70">{locale === "so" ? org.ministryName : org.ministryNameEn}</div>
          </div>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">{t("app.name")}</h1>
          <p className="text-primary-foreground/80">{t("app.tagline")}</p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li>• {t("nav.submissions")} — {t("forms.A.short")}–{t("forms.H.short")}</li>
            <li>• {t("validation.title")}</li>
            <li>• {t("nav.execution")}, {t("nav.analysis")}, {t("nav.reports")}</li>
          </ul>
        </div>
        <div className="flex items-start gap-2 text-xs text-primary-foreground/70">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("auth.securityNotice")}</span>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -right-8 top-1/3 size-48 rounded-full bg-white/5" />
      </aside>

      <main className="flex flex-col bg-background">
        <div className="flex justify-end gap-1 p-4">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1.5 lg:hidden">
              <div className="flex items-center gap-2 text-primary">
                <Landmark className="size-5" aria-hidden />
                <span className="text-sm font-semibold">{locale === "so" ? org.ministryName : org.ministryNameEn}</span>
              </div>
              <p className="text-lg font-semibold">{t("app.name")}</p>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">{t("auth.signIn")}</h2>
              <p className="text-sm text-muted-foreground">{t("auth.welcome")}</p>
            </div>
            <LoginForm next={next} />
            <p className="text-xs text-muted-foreground lg:hidden">{t("auth.securityNotice")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

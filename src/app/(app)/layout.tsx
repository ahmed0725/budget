import { cookies } from "next/headers";
import { after } from "next/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { navigationFor } from "@/lib/navigation";
import { sendDeadlineReminders, unreadCount } from "@/lib/services/notifications";
import { getSettings } from "@/lib/services/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Pages enforce the pending password change; the shell must still render on /profile.
  const actor = await requireActor({ allowPendingPasswordChange: true });
  const [{ locale }, settings, unread, roles, store] = await Promise.all([
    getT(),
    getSettings(),
    unreadCount(actor.id),
    prisma.role.findMany({ where: { key: { in: actor.roles } }, select: { name: true, nameSo: true } }),
    cookies(),
  ]);
  const org = settings.organization;
  // Deadline reminders are generated in the background (throttled to once an hour).
  after(() => sendDeadlineReminders({ reminderDays: settings.budget.deadlineReminderDays }).catch((e) => console.error("Deadline reminders failed", e)));
  const sidebarOpen = store.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        sections={navigationFor(actor.permissions)}
        organization={{ ministry: locale === "so" ? org.ministryName : org.ministryNameEn, government: locale === "so" ? org.governmentName : org.governmentNameEn }}
      />
      <SidebarInset className="min-w-0">
        <header data-app-topbar className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {locale === "so" ? org.departmentName : org.departmentNameEn} · {locale === "so" ? org.ministryName : org.ministryNameEn}
          </div>
          <div className="flex items-center gap-0.5">
            <NotificationBell initialUnread={unread} />
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu name={actor.name} email={actor.email} roles={roles.map((r) => (locale === "so" && r.nameSo ? r.nameSo : r.name))} />
          </div>
        </header>
        <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

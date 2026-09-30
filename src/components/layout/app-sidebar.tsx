"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Landmark,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useT } from "@/lib/i18n/client";
import type { NavIcon, NavSection } from "@/lib/navigation";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  budget: FileSpreadsheet,
  execution: Wallet,
  analysis: BarChart3,
  reports: FileText,
  workflow: ClipboardCheck,
  admin: Settings2,
  audit: ScrollText,
};

function isActive(href: string, pathname: string, search: URLSearchParams): boolean {
  const [path, query] = href.split("?");
  if (query) {
    const params = new URLSearchParams(query);
    return pathname === path && [...params.entries()].every(([k, v]) => search.get(k) === v);
  }
  if (path === "/administration/budget-codes") return pathname === path && !search.get("kind");
  if (path === "/reports") return pathname === path && !search.get("group");
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar({ sections, organization }: { sections: NavSection[]; organization: { ministry: string; government: string } }) {
  const { t } = useT();
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t("app.name")}>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Landmark className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">{t("app.shortName")}</span>
                  <span className="truncate text-xs text-muted-foreground">{organization.ministry}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {sections.map((section) => {
              const Icon = ICONS[section.icon];
              if (section.href) {
                const active = isActive(section.href, pathname, search);
                return (
                  <SidebarMenuItem key={section.key}>
                    <SidebarMenuButton asChild isActive={active} tooltip={t(section.label)}>
                      <Link href={section.href} aria-current={active ? "page" : undefined}>
                        <Icon aria-hidden />
                        <span>{t(section.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              const open = section.items?.some((i) => isActive(i.href, pathname, search) || pathname.startsWith(i.href.split("?")[0])) ?? false;
              return (
                <Collapsible key={section.key} asChild defaultOpen={open} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={t(section.label)}>
                        <Icon aria-hidden />
                        <span>{t(section.label)}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {section.items?.map((item) => {
                          const active = isActive(item.href, pathname, search);
                          return (
                            <SidebarMenuSubItem key={item.key}>
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link href={item.href} aria-current={active ? "page" : undefined}>
                                  <span>{t(item.label)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-[11px] leading-snug text-muted-foreground">{organization.government}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

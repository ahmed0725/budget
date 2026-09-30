"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export const WORKSPACE_TABS = ["a", "b", "c", "d", "e", "f", "g", "h", "validation", "certification", "review", "attachments", "history"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export function WorkspaceTabs({ submissionId, openCorrections }: { submissionId: string; openCorrections: number }) {
  const { t } = useT();
  const pathname = usePathname();
  const base = `/budget/workspace/${submissionId}`;
  const label = (tab: WorkspaceTab) => {
    if (tab.length === 1) {
      const f = tab.toUpperCase() as "A";
      return (
        <>
          <span className="font-semibold">{f}</span> {t(`forms.${f}.short`)}
        </>
      );
    }
    return t(`budget.${tab}` as "budget.validation");
  };
  return (
    <nav aria-label={t("budget.forms")} className="no-print -mx-1 mb-5 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max gap-0.5 px-1">
        {WORKSPACE_TABS.map((tab) => {
          const href = `${base}/${tab}`;
          const active = pathname === href;
          return (
            <li key={tab}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center gap-1 px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                )}
              >
                {label(tab)}
                {tab === "review" && openCorrections > 0 ? (
                  <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold text-warning-foreground dark:text-warning">{openCorrections}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

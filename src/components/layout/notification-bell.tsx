"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { useFormat } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const { t } = useT();
  const fmt = useFormat();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications?limit=12", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { unread: number; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch("/api/notifications?count=1", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setUnread(((await res.json()) as { unread: number }).unread);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t("notifications.title")}${unread ? ` — ${t("notifications.unread", { count: unread })}` : ""}`}>
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("notifications.title")}</p>
            <p className="text-xs text-muted-foreground">{t("notifications.unread", { count: unread })}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending || unread === 0}
            onClick={() =>
              start(async () => {
                await markNotificationsReadAction("all");
                await load();
              })
            }
          >
            <CheckCheck aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {items === null ? (
            <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link ?? "/notifications"}
                    onClick={() => {
                      setOpen(false);
                      if (!n.isRead) void markNotificationsReadAction([n.id]);
                    }}
                    className={cn("block px-4 py-3 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none", !n.isRead && "bg-accent/40")}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary")} aria-hidden />
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium leading-snug">{n.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        <p className="text-[11px] text-muted-foreground">{fmt.relative(n.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t("dashboard.viewAll")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

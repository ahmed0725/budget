"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { markNotificationsReadAction } from "@/app/actions/notifications";

export function MarkAllReadButton() {
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => markNotificationsReadAction("all"))}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
      {t("notifications.markAllRead")}
    </Button>
  );
}

/** Opening a notification marks it as read. */
export function NotificationLink({ id, href, unread, title }: { id: string; href: string | null; unread: boolean; title: string }) {
  const markRead = () => {
    if (unread) void markNotificationsReadAction([id]);
  };
  const cls = unread ? "font-semibold" : "font-medium";
  return href ? (
    <Link href={href} onClick={markRead} className={`${cls} text-sm hover:underline`}>
      {title}
    </Link>
  ) : (
    <button type="button" onClick={markRead} className={`${cls} text-left text-sm`}>
      {title}
    </button>
  );
}

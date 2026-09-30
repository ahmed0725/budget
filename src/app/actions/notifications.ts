"use server";

import { refresh } from "next/cache";
import { actorForAction } from "@/lib/auth/session";
import { markRead } from "@/lib/services/notifications";

export async function markNotificationsReadAction(ids: string[] | "all") {
  const actor = await actorForAction();
  await markRead(actor.id, ids === "all" ? "all" : ids.slice(0, 200));
  refresh();
}

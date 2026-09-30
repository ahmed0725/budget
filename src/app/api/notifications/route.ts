import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Latest notifications and unread count for the signed-in user (polled by the bell). */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const url = new URL(request.url);
  const countOnly = url.searchParams.get("count") === "1";
  const unread = await prisma.notification.count({ where: { userId: actor.id, isRead: false } });
  if (countOnly) return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, 50);
  const items = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, body: true, link: true, isRead: true, createdAt: true },
  });
  return NextResponse.json({ unread, items }, { headers: { "Cache-Control": "no-store" } });
}

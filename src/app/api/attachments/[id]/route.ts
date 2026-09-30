import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { toErrorPayload } from "@/lib/errors";
import { readAttachment } from "@/lib/services/attachments";

export async function GET(_request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const { att, data } = await readAttachment(actor, id);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(att.fileName)}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const payload = toErrorPayload(err);
    return NextResponse.json({ error: payload.message }, { status: payload.code === "NOT_FOUND" ? 404 : 400 });
  }
}

import type { NextRequest } from "next/server";
import { getActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/actor";
import { toCsv } from "@/lib/exports/csv";
import { audit } from "@/lib/services/audit";
import { exportAuditLogs } from "@/lib/services/audit-log";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** CSV export of the audit trail with the same filters as the Audit logs page. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!can(actor, "audit.view")) return Response.json({ error: "You do not have permission to export audit logs." }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const get = (k: string) => sp.get(k) || undefined;
  const rows = await exportAuditLogs(actor, { action: get("action"), entity: get("entity"), entityId: get("entityId"), userId: get("user"), mdaId: get("mda"), from: get("from"), to: get("to"), q: get("q") });
  const csv = toCsv(
    ["id", "time_utc", "user", "action", "entity", "entity_id", "summary", "reason", "ip", "old_value", "new_value"],
    rows.map((r) => [String(r.id), r.createdAt.toISOString(), r.userName ?? "", r.action, r.entityType, r.entityId ?? "", r.summary ?? "", r.reason ?? "", r.ip ?? "", r.oldValue ? JSON.stringify(r.oldValue) : "", r.newValue ? JSON.stringify(r.newValue) : ""]),
  );
  await audit(prisma, actor, { action: "EXPORT", entityType: "AuditLog", summary: `Exported ${rows.length} audit log entries (CSV)`, newValue: Object.fromEntries(sp.entries()) });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

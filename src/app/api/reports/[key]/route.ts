import type { NextRequest } from "next/server";
import { can } from "@/lib/auth/actor";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createT, tDynamic } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { reportByKey } from "@/lib/reports/definitions";
import { reportParams, searchParamsOf } from "@/lib/reports/params";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/reports/render";
import { audit } from "@/lib/services/audit";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

const TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
} as const;

/** Export a standard report as PDF, Excel or CSV with the same filters as the report page. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/[key]">) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const { key } = await ctx.params;
  const def = reportByKey(key);
  if (!def) return Response.json({ error: "Unknown report." }, { status: 404 });
  if (!def.permissions.every((p) => can(actor, p)) || !can(actor, "reports.export")) return Response.json({ error: "You do not have permission to export this report." }, { status: 403 });
  const format = request.nextUrl.searchParams.get("format") ?? "pdf";
  if (!(format in TYPES)) return Response.json({ error: "Choose pdf, xlsx or csv." }, { status: 400 });
  try {
    const locale = await getLocale();
    const [settings, params] = await Promise.all([getSettings(), reportParams(searchParamsOf(request.nextUrl.searchParams), def)]);
    const t = createT(locale);
    const result = await def.run(actor, params, { locale, L: (en, so) => (locale === "so" ? so : en), status: (st) => tDynamic(t, "status", st) });
    const body = format === "pdf" ? await reportPdf(result, settings, actor.name) : format === "xlsx" ? await reportXlsx(result, settings, actor.name) : reportCsv(result);
    await audit(prisma, actor, { action: "EXPORT", entityType: "Report", entityId: def.key, summary: `Exported ${def.title.en} (${format.toUpperCase()})`, newValue: { ...params } });
    const name = `${def.key}-${def.filters.includes("year") ? params.year : new Date().toISOString().slice(0, 10)}.${format}`;
    return new Response(body as BodyInit, { headers: { "Content-Type": TYPES[format as keyof typeof TYPES], "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

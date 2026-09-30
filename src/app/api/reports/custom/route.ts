import type { NextRequest } from "next/server";
import { can } from "@/lib/auth/actor";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/server";
import { decodeConfig, getSavedReport, runBuilder } from "@/lib/reports/builder";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/reports/render";
import { audit } from "@/lib/services/audit";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

const TYPES = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8" } as const;

/** Export a custom (report builder) report. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!can(actor, "reports.view") || !can(actor, "reports.export")) return Response.json({ error: "You do not have permission to export reports." }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") ?? "pdf";
  if (!(format in TYPES)) return Response.json({ error: "Choose pdf, xlsx or csv." }, { status: 400 });
  try {
    const saved = sp.get("saved") ? await getSavedReport(actor, sp.get("saved")!) : null;
    const config = decodeConfig(sp.get("config") ?? undefined) ?? saved?.config;
    if (!config) return Response.json({ error: "The report configuration is missing or invalid." }, { status: 400 });
    const [locale, settings] = await Promise.all([getLocale(), getSettings()]);
    const result = await runBuilder(actor, config, locale, saved?.name);
    const body = format === "pdf" ? await reportPdf(result, settings, actor.name) : format === "xlsx" ? await reportXlsx(result, settings, actor.name) : reportCsv(result);
    await audit(prisma, actor, { action: "EXPORT", entityType: "Report", entityId: saved?.id ?? "custom", summary: `Exported custom report${saved ? ` "${saved.name}"` : ""} (${format.toUpperCase()})`, newValue: config });
    return new Response(body as BodyInit, { headers: { "Content-Type": TYPES[format as keyof typeof TYPES], "Content-Disposition": `attachment; filename="custom-report-${config.year}.${format}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

import type { NextRequest } from "next/server";
import { can } from "@/lib/auth/actor";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { toCsv } from "@/lib/exports/csv";
import { audit } from "@/lib/services/audit";
import { executionLines } from "@/lib/services/execution";

export const dynamic = "force-dynamic";

/** CSV of execution lines (MDA × code) with monthly actuals. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!can(actor, "execution.view") || !can(actor, "reports.export")) return Response.json({ error: "You do not have permission to export execution data." }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const kind = sp.get("kind") === "REVENUE" ? "REVENUE" : "EXPENDITURE";
  const year = Number(sp.get("year"));
  if (!Number.isInteger(year)) return Response.json({ error: "Choose a budget year." }, { status: 400 });
  try {
    const lines = await executionLines(actor, { year, kind, mdaId: sp.get("mda") || undefined, sectorId: sp.get("sector") || undefined });
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const csv = toCsv(
      ["year", "mda_code", "mda", "code", "description", kind === "EXPENDITURE" ? "original_budget" : "original_target", kind === "EXPENDITURE" ? "revised_budget" : "revised_target", ...months, "actual_total", ...(kind === "EXPENDITURE" ? ["committed", "available"] : ["remaining"]), "rate_percent"],
      lines.map((l) => [year, l.mdaCode, l.mdaName, l.code, l.codeName, l.original, l.revised, ...l.months, l.actual, ...(kind === "EXPENDITURE" ? [l.committed, l.available] : [l.available]), l.rate ?? ""]),
    );
    await audit(prisma, actor, { action: "EXPORT", entityType: kind === "EXPENDITURE" ? "ExpenditureExecution" : "RevenueExecution", summary: `Exported ${year} ${kind.toLowerCase()} execution (${lines.length} lines, CSV)` });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind.toLowerCase()}-execution-${year}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

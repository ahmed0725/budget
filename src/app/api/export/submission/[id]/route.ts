import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { toErrorPayload } from "@/lib/errors";
import { buildForm4Workbook } from "@/lib/exports/form4";
import { buildSubmissionPdf } from "@/lib/exports/submission-pdf";
import { audit } from "@/lib/services/audit";
import { getSettings } from "@/lib/services/settings";
import { getBundleForActor } from "@/lib/services/submissions";

export async function GET(request: Request, ctx: RouteContext<"/api/export/submission/[id]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (!actor.permissions.has("export.run")) return NextResponse.json({ error: "You do not have permission to export budget data." }, { status: 403 });
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  try {
    const { id } = await ctx.params;
    const bundle = await getBundleForActor(actor, id);
    const settings = await getSettings();
    const s = bundle.submission;
    const now = new Date();
    const latestVersion = await prisma.budgetVersion.findFirst({ where: { submissionId: id }, orderBy: { versionNumber: "desc" }, select: { label: true } });
    let body: Buffer;
    let contentType: string;
    if (format === "xlsx") {
      body = await buildForm4Workbook(bundle, settings, { generatedBy: actor.name, generatedAt: now, versionLabel: latestVersion?.label ?? null, mdaNameEn: s.mda.nameEn });
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      const steps = await prisma.approvalStep.findMany({ where: { submissionId: id }, orderBy: { createdAt: "asc" }, select: { action: true, toStatus: true, actorName: true, comment: true, createdAt: true } });
      body = await buildSubmissionPdf(bundle, settings, { generatedBy: actor.name, generatedAt: now, steps });
      contentType = "application/pdf";
    }
    const fileName = `Foom-Miisaaniyadda-${s.budgetYear.year}-${s.mda.code}${s.type === "REVISION" ? `-R${s.revisionNumber}` : ""}.${format}`;
    await audit(prisma, actor, { action: "EXPORT", entityType: "BudgetSubmission", entityId: id, mdaId: s.mdaId, budgetYearId: s.budgetYearId, summary: `Exported ${fileName}` });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const payload = toErrorPayload(err);
    return NextResponse.json({ error: payload.message }, { status: payload.code === "NOT_FOUND" ? 404 : 400 });
  }
}

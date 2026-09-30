import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for load balancers and monitoring (public, no data exposed).
 * 200 when the database answers, 503 otherwise.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", latencyMs: Date.now() - started, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", database: "unavailable", time: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

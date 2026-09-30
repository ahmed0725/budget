/** Helpers shared by integration tests. */
import { loadActor } from "@/lib/auth/actor-loader";
import { prisma } from "@/lib/db";

/** Actor for a seeded development user (see prisma/seed/users.ts). */
export async function actorFor(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  return loadActor(prisma, user.id);
}

export function csvFile(name: string, rows: (string | number | null)[][]): File {
  const text = rows.map((r) => r.map((v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
  return new File([text], name, { type: "text/csv" });
}

export async function mdaId(code: string) {
  return (await prisma.mda.findUniqueOrThrow({ where: { code } })).id;
}

export async function yearId(year: number) {
  return (await prisma.budgetYear.findUniqueOrThrow({ where: { year } })).id;
}

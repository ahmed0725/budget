import "server-only";
import { can, isAgencyMember, mdaScope, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db";

export interface Option {
  value: string;
  label: string;
}

/** Budget years, sectors and MDAs (within the actor's scope) for filter bars. */
export async function filterOptions(actor: Actor, locale: "en" | "so") {
  const scope = mdaScope(actor);
  const [years, sectors, mdas] = await Promise.all([
    prisma.budgetYear.findMany({ orderBy: { year: "desc" }, select: { id: true, year: true, status: true } }),
    prisma.sector.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.mda.findMany({ where: { deletedAt: null, ...(scope ? { id: scope } : {}) }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, nameEn: true, sectorId: true, isActive: true } }),
  ]);
  return {
    years: years.map((y) => ({ value: String(y.year), label: `${y.year}` })),
    yearRecords: years,
    sectors: sectors.map((s) => ({ value: s.id, label: `${s.code} — ${locale === "en" && s.nameEn ? s.nameEn : s.name}` })),
    mdas: mdas.map((m) => ({ value: m.id, label: `${m.code} — ${locale === "en" && m.nameEn ? m.nameEn : m.name}` })),
    mdaRecords: mdas,
  };
}

/** Active MDAs the actor may create a budget for in the given year (none exists yet). */
export async function creatableMdas(actor: Actor, budgetYearId: string, locale: "en" | "so") {
  if (!can(actor, "budget.prepare")) return [];
  const mdas = await prisma.mda.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      submissions: { none: { budgetYearId, type: "ORIGINAL" } },
      ...(actor.allMdas ? {} : { id: { in: actor.assignments.map((a) => a.mdaId) } }),
    },
    orderBy: { code: "asc" },
  });
  return mdas.filter((m) => actor.allMdas || isAgencyMember(actor, m.id)).map((m) => ({ id: m.id, label: `${m.code} — ${locale === "en" && m.nameEn ? m.nameEn : m.name}` }));
}

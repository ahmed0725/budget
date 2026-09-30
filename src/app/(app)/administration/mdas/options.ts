import "server-only";
import { prisma } from "@/lib/db";
import type { MdaFormOptions } from "./mda-form";

export async function mdaFormOptions(locale: "en" | "so"): Promise<MdaFormOptions> {
  const [sectors, lookups, mdas] = await Promise.all([
    prisma.sector.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.lookupValue.findMany({ where: { isActive: true, category: { in: ["AGENCY_TYPE", "REGION", "MDA_CATEGORY"] } }, orderBy: [{ sortOrder: "asc" }] }),
    prisma.mda.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, nameEn: true } }),
  ]);
  const label = (x: { name: string; nameEn: string | null }) => (locale === "en" && x.nameEn ? x.nameEn : x.name);
  const lk = (c: string) => lookups.filter((l) => l.category === c).map((l) => ({ value: l.id, label: label(l) }));
  return {
    sectors: sectors.map((s) => ({ value: s.id, label: `${s.code} — ${label(s)}` })),
    agencyTypes: lk("AGENCY_TYPE"),
    regions: lk("REGION"),
    categories: lk("MDA_CATEGORY"),
    parents: mdas.map((m) => ({ value: m.id, label: `${m.code} — ${label(m)}` })),
  };
}

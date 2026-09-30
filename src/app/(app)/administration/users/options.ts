import "server-only";
import { prisma } from "@/lib/db";
import type { UserFormOptions } from "./user-form";

export async function userFormOptions(locale: "en" | "so"): Promise<UserFormOptions> {
  const [roles, mdas] = await Promise.all([
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, key: true, name: true, nameSo: true, description: true } }),
    prisma.mda.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, nameEn: true } }),
  ]);
  return {
    roles: roles.map((r) => ({ value: r.id, label: locale === "so" && r.nameSo ? r.nameSo : r.name, hint: r.description ?? r.key })),
    mdas: mdas.map((m) => ({ value: m.id, label: `${m.code} — ${locale === "en" && m.nameEn ? m.nameEn : m.name}` })),
  };
}

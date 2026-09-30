import "server-only";
import { can, type Actor } from "@/lib/auth/actor";
import { PROFILE_KEYS, PROFILES } from "@/lib/imports/profiles";

export interface ProfileSummary {
  key: string;
  label: string;
  description: string;
  accepts: string[];
  correctable: boolean;
  fields: { key: string; label: string; required: boolean }[] | null;
}

/** Import types the actor may run, with display texts (safe to pass to client components). */
export function profileSummaries(actor: Actor, locale: "en" | "so"): ProfileSummary[] {
  return PROFILE_KEYS.filter((k) => can(actor, PROFILES[k].permission)).map((k) => {
    const p = PROFILES[k];
    return {
      key: k,
      label: p.label[locale],
      description: p.description[locale],
      accepts: [...p.accepts],
      correctable: p.correctable,
      fields: p.fields ? p.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })) : null,
    };
  });
}

export function profileLabel(key: string, locale: "en" | "so") {
  return PROFILES[key as keyof typeof PROFILES]?.label[locale] ?? key;
}

import { en, type Dictionary } from "./en";
import { so } from "./so";

export type Locale = "en" | "so";
export const LOCALES: Locale[] = ["en", "so"];
export const LOCALE_COOKIE = "gbms_locale";

export const dictionaries: Record<Locale, Dictionary> = { en: en as unknown as Dictionary, so };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T]: T[K] extends string ? K & string : Join<K, Paths<T[K]>> }[keyof T];

/** Every valid translation key, e.g. "nav.dashboard" or "forms.A.title". */
export type TranslationKey = Paths<Dictionary>;
export type TParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, params?: TParams) => string;

export function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function createT(locale: Locale): TFunction {
  const dict = dictionaries[locale] ?? dictionaries.en;
  return (key, params) => interpolate(lookup(dict, key) ?? lookup(dictionaries.en, key) ?? key, params);
}

/** Translate a dynamic key (e.g. a status value) with a fallback. */
export function tDynamic(t: TFunction, prefix: string, value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback ?? "";
  const key = `${prefix}.${value}` as TranslationKey;
  const text = t(key);
  return text === key ? (fallback ?? value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())) : text;
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "so";
}

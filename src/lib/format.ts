/**
 * Display formatting (isomorphic). Currency and timezone come from system settings;
 * amounts use the official format "$1,250,000.00".
 */
export interface FormatConfig {
  currencyCode: string;
  currencySymbol: string;
  decimals: number;
  timezone: string;
  locale: "en" | "so";
}

export const DEFAULT_FORMAT: FormatConfig = { currencyCode: "USD", currencySymbol: "$", decimals: 2, timezone: "Africa/Mogadishu", locale: "en" };

type Num = number | string | { toString(): string } | null | undefined;

function toNum(v: Num): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(value: Num, cfg: Partial<FormatConfig> & { compact?: boolean; decimals?: number; signed?: boolean } = {}): string {
  const n = toNum(value);
  if (n === null) return "—";
  const symbol = cfg.currencySymbol ?? DEFAULT_FORMAT.currencySymbol;
  const sign = n < 0 ? "-" : cfg.signed && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (cfg.compact) {
    const units: [number, string][] = [
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [size, unit] of units) {
      if (abs >= size) {
        const scaled = abs / size;
        return `${sign}${symbol}${scaled.toLocaleString("en-US", { maximumFractionDigits: scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2 })}${unit}`;
      }
    }
    return `${sign}${symbol}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  const decimals = cfg.decimals ?? DEFAULT_FORMAT.decimals;
  return `${sign}${symbol}${abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatNumber(value: Num, decimals = 0): string {
  const n = toNum(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(value: Num, decimals = 1, opts: { signed?: boolean } = {}): string {
  const n = toNum(value);
  if (n === null) return "—";
  const sign = opts.signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

function intlLocale(locale: "en" | "so") {
  return locale === "so" ? "so-SO" : "en-GB";
}

export function formatDate(value: Date | string | null | undefined, cfg: Partial<FormatConfig> = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(cfg.locale ?? "en"), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: cfg.timezone ?? DEFAULT_FORMAT.timezone,
  }).format(d);
}

/** Dates stored as calendar dates (DATE columns) are formatted in UTC to avoid day shifts. */
export function formatCalendarDate(value: Date | string | null | undefined, cfg: Partial<FormatConfig> = {}): string {
  return formatDate(value, { ...cfg, timezone: "UTC" });
}

export function formatDateTime(value: Date | string | null | undefined, cfg: Partial<FormatConfig> = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(cfg.locale ?? "en"), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: cfg.timezone ?? DEFAULT_FORMAT.timezone,
  }).format(d);
}

/** Relative time ("3 hours ago") for activity feeds. */
export function formatRelative(value: Date | string, locale: "en" | "so" = "en", now = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "so" ? "so" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export const MONTH_NAMES: Record<"en" | "so", string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  so: ["Jan", "Feb", "Mar", "Abr", "May", "Jun", "Luu", "Ogo", "Seb", "Okt", "Nof", "Dis"],
};

export const MONTH_NAMES_LONG: Record<"en" | "so", string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  so: ["Janaayo", "Febraayo", "Maarso", "Abriil", "Maajo", "Juun", "Luulyo", "Ogosto", "Sebteembar", "Oktoobar", "Nofeembar", "Diseembar"],
};

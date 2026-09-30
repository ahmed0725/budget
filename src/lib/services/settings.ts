/**
 * System settings (currency, timezone, organisation, security and budget rules).
 * Stored as JSON in `system_settings`; defaults apply when a key is missing.
 */
import { prisma } from "@/lib/db";

export interface AppSettings {
  organization: {
    governmentName: string;
    governmentNameEn: string;
    ministryName: string;
    ministryNameEn: string;
    departmentName: string;
    departmentNameEn: string;
  };
  currency: { code: string; symbol: string; decimals: number; name: string };
  timezone: string;
  defaultLocale: "en" | "so";
  security: {
    sessionHours: number;
    idleTimeoutMinutes: number;
    maxFailedLogins: number;
    lockoutMinutes: number;
    passwordMinLength: number;
  };
  budget: {
    /** Require all three MDA certification sign-offs before submission. */
    requireFullCertification: boolean;
    /** Days before the submission deadline when reminders are sent. */
    deadlineReminderDays: number;
    /** Variance (in %) above which a line is flagged as a large variance. */
    largeVariancePercent: number;
    /** Revenue collection rate (in %) below which an alert is raised. */
    revenueAlertPercent: number;
  };
  attachments: { maxSizeMb: number; allowedExtensions: string[] };
}

export const DEFAULT_SETTINGS: AppSettings = {
  organization: {
    governmentName: "Dowladda Waqooyi Bari ee Soomaaliyeed",
    governmentNameEn: "North Eastern State of Somalia",
    ministryName: "Wasaaradda Maaliyadda",
    ministryNameEn: "Ministry of Finance",
    departmentName: "Waaxda Miisaaniyadda",
    departmentNameEn: "Budget Department",
  },
  currency: { code: "USD", symbol: "$", decimals: 2, name: "US Dollars (US$)" },
  timezone: "Africa/Mogadishu",
  defaultLocale: "en",
  security: { sessionHours: 10, idleTimeoutMinutes: 60, maxFailedLogins: 5, lockoutMinutes: 15, passwordMinLength: 10 },
  budget: { requireFullCertification: false, deadlineReminderDays: 7, largeVariancePercent: 20, revenueAlertPercent: 80 },
  attachments: { maxSizeMb: 15, allowedExtensions: ["pdf", "docx", "doc", "xlsx", "xls", "csv", "png", "jpg", "jpeg"] },
};

type SettingKey = keyof AppSettings;

function merge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== "object" || Array.isArray(base) || typeof override !== "object" || Array.isArray(override)) {
    return override as T;
  }
  const result = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    result[k] = k in result ? merge(result[k], v) : v;
  }
  return result as T;
}

let cache: { value: AppSettings; at: number } | null = null;
const CACHE_MS = 30_000;

/** Load settings (cached briefly; settings change rarely). */
export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await prisma.systemSetting.findMany();
  let value = DEFAULT_SETTINGS;
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      value = { ...value, [row.key]: merge(DEFAULT_SETTINGS[row.key as SettingKey], row.value) };
    }
  }
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache() {
  cache = null;
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

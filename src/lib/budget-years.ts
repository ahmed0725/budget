import type { Phase } from "@/components/budget/year-timeline";
import { formatCalendarDate } from "@/lib/format";
import type { Locale, TFunction } from "@/lib/i18n";

export interface YearDates {
  startDate: Date;
  endDate: Date;
  preparationStart: Date | null;
  preparationEnd: Date | null;
  submissionDeadline: Date | null;
  reviewStart: Date | null;
  reviewEnd: Date | null;
  approvalStart: Date | null;
  approvalEnd: Date | null;
  executionStart: Date | null;
  executionEnd: Date | null;
  closingDate: Date | null;
}

export const YEAR_DATE_FIELDS = ["startDate", "endDate", "preparationStart", "preparationEnd", "submissionDeadline", "reviewStart", "reviewEnd", "approvalStart", "approvalEnd", "executionStart", "executionEnd", "closingDate"] as const;

/** Calendar date → "YYYY-MM-DD" (DATE columns are stored at UTC midnight). */
export function isoDay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** The five phases of the budget calendar, in order. */
export function yearPhases(y: YearDates, t: TFunction, locale: Locale): Phase[] {
  const f = (d: Date | null) => formatCalendarDate(d, { locale });
  const range = (a: Date | null, b: Date | null) => (a || b ? `${a ? f(a) : "…"} – ${b ? f(b) : "…"}` : "—");
  return [
    { key: "preparation", label: t("admin.preparation"), from: y.preparationStart, to: y.preparationEnd ?? y.submissionDeadline, range: range(y.preparationStart, y.preparationEnd ?? y.submissionDeadline) },
    { key: "review", label: t("admin.review"), from: y.reviewStart, to: y.reviewEnd, range: range(y.reviewStart, y.reviewEnd) },
    { key: "approval", label: t("admin.approval"), from: y.approvalStart, to: y.approvalEnd, range: range(y.approvalStart, y.approvalEnd) },
    { key: "execution", label: t("admin.execution"), from: y.executionStart ?? y.startDate, to: y.executionEnd ?? y.endDate, range: range(y.executionStart ?? y.startDate, y.executionEnd ?? y.endDate) },
    { key: "closing", label: t("admin.closing"), from: y.executionEnd ?? y.endDate, to: y.closingDate, range: y.closingDate ? f(y.closingDate) : "—" },
  ];
}

/** The moment `days` days before now (for "last 30 days" style queries). */
export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Whole days from today to a deadline (negative when overdue). */
export function daysUntil(deadline: Date, now = new Date()): number {
  const day = 86_400_000;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((deadline.getTime() - today) / day);
}

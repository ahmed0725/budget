import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { AuthorizationError } from "@/lib/errors";
import { deleteSavedReport, getSavedReport, runBuilder, saveReport, type BuilderConfig } from "@/lib/reports/builder";
import { REPORTS, reportByKey } from "@/lib/reports/definitions";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/reports/render";
import type { ReportParams } from "@/lib/reports/types";
import { yearTotals } from "@/lib/services/analytics";
import { getSettings } from "@/lib/services/settings";
import { actorFor } from "../support/db";

const ctx = { locale: "en" as const, L: (en: string) => en, status: (s: string) => s };
const params = (year: number, extra: Partial<ReportParams> = {}): ReportParams => ({ year, compareYear: year - 1, dataset: "effective", ...extra });

let admin: Actor;

beforeAll(async () => {
  admin = await actorFor("admin");
});

describe("standard reports", () => {
  it("has the 15 reports required by the specification", () => {
    expect(REPORTS).toHaveLength(15);
  });

  it.each(REPORTS.map((r) => r.key))("%s runs and renders to PDF, Excel and CSV", async (key) => {
    const def = reportByKey(key)!;
    const result = await def.run(admin, params(def.defaultYear === "execution" ? 2026 : 2027), ctx);
    expect(result.title).toBeTruthy();
    expect(result.sections.length).toBeGreaterThan(0);
    const settings = await getSettings();
    const [pdf, xlsx] = await Promise.all([reportPdf(result, settings, "Test"), reportXlsx(result, settings, "Test")]);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    expect(reportCsv(result).charCodeAt(0)).toBe(0xfeff);
  });

  it("budget summary totals agree with the analytics totals", async () => {
    const [totals] = await yearTotals(admin, [2026], { dataset: "approved" });
    const r = await reportByKey("budget-summary")!.run(admin, params(2026, { dataset: "approved" }), ctx);
    const byCategory = r.sections[1];
    expect(byCategory.totals?.amount).toBeCloseTo(totals.expenditure, 2);
    expect(r.summary?.find((s) => s.label === "Revenue")?.value).toBeCloseTo(totals.revenue, 2);
  });

  it("limits agency users to their own MDA", async () => {
    const officer = await actorFor("officer.40101");
    const r = await reportByKey("mda-budget")!.run(officer, params(2026), ctx);
    expect(r.sections[0].rows.map((x) => String(x.mda).slice(0, 5))).toEqual(["40101"]);
  });

  it("shows only approved budgets to approved-only viewers", async () => {
    const executive = await actorFor("executive");
    const r = await reportByKey("submission-status")!.run(executive, params(2027), ctx);
    const statuses = new Set(r.sections[0].rows.map((x) => x.status));
    for (const s of statuses) expect(["APPROVED", "PUBLISHED"]).toContain(s);
  });
});

describe("report builder", () => {
  const config: BuilderConfig = { source: "budget", year: 2026, dataset: "approved", kind: "EXPENDITURE", groupBy: ["sector", "mda"], measures: ["amount", "prior", "change", "changePct", "share"], sortBy: "amount", sortDir: "desc" };

  it("groups, totals and sorts", async () => {
    const [totals] = await yearTotals(admin, [2026], { dataset: "approved" });
    const r = await runBuilder(admin, config, "en");
    const rows = r.sections[0].rows;
    expect(r.sections[0].totals?.amount).toBeCloseTo(totals.expenditure, 2);
    expect(Number(rows[0].amount)).toBeGreaterThanOrEqual(Number(rows[1].amount));
    expect(r.sections[0].columns.map((c) => c.key)).toEqual(["sector", "mda", "amount", "prior", "change", "changePct", "share"]);
  });

  it("builds execution reports", async () => {
    const r = await runBuilder(admin, { ...config, source: "execution", groupBy: ["category"], measures: ["budget", "actual", "rate"], sortBy: "budget" }, "en");
    expect(r.sections[0].rows.length).toBeGreaterThan(0);
    expect(Number(r.sections[0].totals?.actual)).toBeGreaterThan(0);
  });

  it("saves configurations; only the owner may change them and shared reports are visible to others", async () => {
    const saved = await saveReport(admin, { id: null, name: "Expenditure by sector and MDA", description: null, isShared: true, config });
    const analyst = await actorFor("analyst");
    expect((await getSavedReport(analyst, saved.id)).config.groupBy).toEqual(["sector", "mda"]);
    await expect(saveReport(analyst, { id: saved.id, name: "Changed", description: null, isShared: true, config })).rejects.toBeInstanceOf(AuthorizationError);
    await deleteSavedReport(admin, saved.id);
  });
});

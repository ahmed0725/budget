import "server-only";
import { param, resolveYear, type SearchParams } from "@/lib/page-params";
import type { ReportDefinition } from "./definitions";
import type { ReportParams } from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Report parameters from URL search params, with defaults suited to the report. */
export async function reportParams(sp: SearchParams, def: ReportDefinition): Promise<ReportParams> {
  const year = await resolveYear(sp, def.defaultYear);
  const from = param(sp, "from");
  const to = param(sp, "to");
  return {
    year,
    compareYear: Number(param(sp, "compareYear")) || year - 1,
    dataset: param(sp, "dataset") === "approved" ? "approved" : "effective",
    sectorId: param(sp, "sector") || undefined,
    mdaId: param(sp, "mda") || undefined,
    status: param(sp, "status") || undefined,
    from: from && DAY.test(from) ? from : undefined,
    to: to && DAY.test(to) ? to : undefined,
    action: param(sp, "action") || undefined,
  };
}

export function searchParamsOf(url: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const [k, v] of url.entries()) out[k] = v;
  return out;
}

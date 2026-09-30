"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/actions";
import { actorForAction } from "@/lib/auth/session";
import { builderConfigSchema, deleteSavedReport, saveReport } from "@/lib/reports/builder";

export async function saveReportAction(input: unknown) {
  return runAction(async () => {
    const actor = await actorForAction("reports.build");
    const data = parseInput(
      z.object({
        id: z.string().max(64).nullable(),
        name: z.string().trim().min(3, "Give the report a name (at least 3 characters)").max(120),
        description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable()),
        isShared: z.boolean(),
        config: builderConfigSchema,
      }),
      input,
    );
    const r = await saveReport(actor, data);
    revalidatePath("/reports/custom");
    return { id: r.id };
  }, "Report saved");
}

export async function deleteSavedReportAction(id: string) {
  return runAction(async () => {
    const actor = await actorForAction("reports.view");
    await deleteSavedReport(actor, z.string().min(1).max(64).parse(id));
    revalidatePath("/reports/custom");
    return null;
  });
}

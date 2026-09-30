import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";
import { loadSubmissionBundle } from "@/lib/services/submission-data";
import { getWorkspace } from "../data";
import { ValidationView } from "./validation-view";

export default async function ValidationPage({ params }: PageProps<"/budget/workspace/[id]/validation">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const { t, locale } = await getT();
  const settings = await getSettings();
  // Re-run the rules in the user's language (server-side, same engine as submission).
  const bundle = locale === "en" ? ws.bundle : await loadSubmissionBundle(prisma, id, { locale });
  const lastRun = await prisma.validationCheck.findFirst({ where: { submissionId: id }, orderBy: { runAt: "desc" }, select: { runAt: true } });
  return (
    <ValidationView
      submissionId={id}
      checks={bundle.checks}
      tally={{ passed: bundle.tally.passed, warnings: bundle.tally.warnings, errors: bundle.tally.errors }}
      lastRun={lastRun ? t("validation.lastRun", { time: formatDateTime(lastRun.runAt, { timezone: settings.timezone, locale }) }) : null}
    />
  );
}

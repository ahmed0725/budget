import Link from "next/link";
import { ShieldX } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

/** Rendered (with HTTP 403) when a page calls forbidden() for a missing permission. */
export default async function AppForbidden() {
  const { t } = await getT();
  return (
    <EmptyState
      className="mx-auto my-10 max-w-2xl"
      icon={ShieldX}
      title={t("common.forbidden")}
      description={t("common.forbiddenBody")}
      action={
        <Button asChild size="sm">
          <Link href="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      }
    />
  );
}

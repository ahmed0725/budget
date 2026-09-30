import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

/** Records that do not exist, or that the user is not allowed to see (no existence leak). */
export default async function AppNotFound() {
  const { t } = await getT();
  return (
    <EmptyState
      className="mx-auto my-10 max-w-2xl"
      icon={SearchX}
      title={t("common.notFound")}
      description={t("common.notFoundBody")}
      action={
        <Button asChild size="sm">
          <Link href="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      }
    />
  );
}

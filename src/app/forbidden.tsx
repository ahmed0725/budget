import Link from "next/link";
import { ShieldX } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function Forbidden() {
  const { t } = await getT();
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <EmptyState
        className="w-full max-w-lg"
        icon={ShieldX}
        title={t("common.forbidden")}
        description={t("common.forbiddenBody")}
        action={
          <Button asChild size="sm">
            <Link href="/dashboard">{t("common.goToDashboard")}</Link>
          </Button>
        }
      />
    </main>
  );
}

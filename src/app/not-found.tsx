import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Not found" };

/** Unknown URLs (outside the application shell). */
export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <EmptyState
        className="w-full max-w-lg"
        icon={SearchX}
        title={t("common.notFound")}
        description={t("common.notFoundBody")}
        action={
          <Button asChild size="sm">
            <Link href="/dashboard">{t("common.goToDashboard")}</Link>
          </Button>
        }
      />
    </main>
  );
}

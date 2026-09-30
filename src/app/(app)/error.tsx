"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/** Unexpected errors inside the application shell (the sidebar and header stay usable). */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorState
        title={t("common.errorTitle")}
        message={t("common.unexpectedError")}
        details={[...(process.env.NODE_ENV !== "production" && error.message ? [error.message] : []), ...(error.digest ? [`${t("common.errorReference")}: ${error.digest}`] : [])]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => retry()}>
              <RotateCcw aria-hidden />
              {t("common.tryAgain")}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard">{t("common.goToDashboard")}</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}

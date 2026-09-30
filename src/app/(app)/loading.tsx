import { LoadingState } from "@/components/app/states";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getT();
  return <LoadingState label={t("common.loading")} />;
}

import { Lock } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { getWorkspace } from "./data";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceTabs } from "./workspace-tabs";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/budget/workspace/[id]">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const { t } = await getT();
  const editableButLocked = !ws.canEdit && (ws.header.isLocked || !["DRAFT", "RETURNED"].includes(ws.header.status));
  return (
    <div>
      <WorkspaceHeader header={ws.header} actions={ws.actions} permissions={ws.permissions} />
      {editableButLocked ? (
        <p className="mb-4 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden />
          {ws.header.isLocked ? t("budget.locked") : t("budget.readOnlyStatus", { status: t(`status.${ws.header.status}` as "status.DRAFT").toLowerCase() })}
        </p>
      ) : null}
      <WorkspaceTabs submissionId={id} openCorrections={ws.header.openCorrections} />
      {children}
    </div>
  );
}

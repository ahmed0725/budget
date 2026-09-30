"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Power, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { setMdaActiveAction, setMdaAssignmentsAction } from "../../actions";

type AssignmentType = "BUDGET_OFFICER" | "FINANCE_OFFICER" | "ACCOUNTING_OFFICER" | "REVIEWER" | "VIEWER";
const TYPES: AssignmentType[] = ["BUDGET_OFFICER", "FINANCE_OFFICER", "ACCOUNTING_OFFICER", "REVIEWER", "VIEWER"];
const TYPE_LABEL: Record<AssignmentType, { en: string; so: string }> = {
  BUDGET_OFFICER: { en: "Budget officer (prepares)", so: "Sarkaalka miisaaniyadda" },
  FINANCE_OFFICER: { en: "Finance officer (reviews internally)", so: "Sarkaalka maaliyadda" },
  ACCOUNTING_OFFICER: { en: "Accounting officer (approves)", so: "Mas'uulka xisaab-celinta" },
  REVIEWER: { en: "Ministry reviewer", so: "Dib-u-eegaha wasaaradda" },
  VIEWER: { en: "Viewer", so: "Daawade" },
};

export function MdaActiveToggle({ mdaId, isActive }: { mdaId: string; isActive: boolean }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <ConfirmDialog
      destructive={isActive}
      trigger={
        <Button variant={isActive ? "outline" : "default"} size="sm">
          <Power aria-hidden />
          {isActive ? t("admin.deactivate") : t("admin.activate")}
        </Button>
      }
      title={isActive ? t("admin.deactivate") : t("admin.activate")}
      description={isActive ? t("admin.deactivateConfirm") : t("admin.activateConfirm")}
      onConfirm={async () => {
        if (handleResult(await setMdaActiveAction(mdaId, !isActive, isActive ? "Deactivated by administrator" : "Activated by administrator"), t("common.saved"))) router.refresh();
      }}
    />
  );
}

export function AssignmentsEditor({ mdaId, users, initial }: { mdaId: string; users: { id: string; label: string }[]; initial: { userId: string; type: AssignmentType; name: string; email: string }[] }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initial.map((a) => ({ userId: a.userId, type: a.type })));
  const [userId, setUserId] = useState<string>("");
  const [type, setType] = useState<AssignmentType>("BUDGET_OFFICER");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial.map((a) => ({ userId: a.userId, type: a.type })));
  const label = (id: string) => users.find((u) => u.id === id)?.label ?? initial.find((a) => a.userId === id)?.name ?? id;
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="mda-users">
      <h2 id="mda-users" className="border-b px-4 py-3 text-sm font-semibold">
        {t("admin.assignedUsers")}
      </h2>
      <ul className="divide-y text-sm">
        {rows.length === 0 ? <li className="px-4 py-3 text-muted-foreground">—</li> : null}
        {rows.map((r, i) => (
          <li key={`${r.userId}-${r.type}`} className="flex items-center justify-between gap-2 px-4 py-2">
            <span>
              {label(r.userId)}
              <span className="block text-xs text-muted-foreground">{TYPE_LABEL[r.type][locale]}</span>
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t p-4 sm:flex-row">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-full sm:flex-1" aria-label={t("common.user")}>
            <SelectValue placeholder={t("common.user")} />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t("admin.assignmentType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((ty) => (
              <SelectItem key={ty} value={ty}>
                {TYPE_LABEL[ty][locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!userId || rows.some((r) => r.userId === userId && r.type === type)}
          onClick={() => {
            setRows([...rows, { userId, type }]);
            setUserId("");
          }}
        >
          <Plus aria-hidden />
          {t("common.add")}
        </Button>
      </div>
      <div className="flex justify-end border-t px-4 py-3">
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              if (handleResult(await setMdaAssignmentsAction(mdaId, rows), t("common.saved"))) router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("admin.saveAssignments")}
        </Button>
      </div>
    </section>
  );
}

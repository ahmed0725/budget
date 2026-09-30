"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Field } from "@/components/app/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { deleteRoleAction, saveRoleAction } from "../actions";

interface RoleRow {
  id: string;
  key: string;
  name: string;
  nameSo: string | null;
  description: string | null;
  isSystem: boolean;
  users: number;
  permissions: string[];
}
interface PermissionRow {
  key: string;
  name: string;
  group: string;
}

const NEW = "__new__";

export function RolesManager({ roles, permissions, selected }: { roles: RoleRow[]; permissions: PermissionRow[]; selected: string | null }) {
  const { t, locale } = useT();
  const [current, setCurrent] = useState<string | null>(selected);
  const groups = useMemo(() => [...new Set(permissions.map((p) => p.group))], [permissions]);
  const role = roles.find((r) => r.id === current);
  const label = (r: RoleRow) => (locale === "so" && r.nameSo ? r.nameSo : r.name);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav aria-label={t("admin.roleList")} className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-semibold">{t("admin.roleList")}</h2>
            <Button size="xs" variant="outline" onClick={() => setCurrent(NEW)}>
              <Plus aria-hidden />
              {t("admin.newRole")}
            </Button>
          </div>
          <ul className="p-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={current === r.id ? "true" : undefined}
                  onClick={() => setCurrent(r.id)}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", current === r.id && "bg-primary/10 font-medium text-primary")}
                >
                  <span className="min-w-0 truncate">
                    {label(r)}
                    {r.isSystem ? <ShieldCheck className="ml-1 inline size-3.5 text-muted-foreground" aria-label="System role" /> : null}
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{r.users}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {current === NEW ? (
          <RoleEditor key={NEW} permissions={permissions} groups={groups} onSaved={(id) => setCurrent(id)} />
        ) : role ? (
          <RoleEditor key={role.id} role={role} permissions={permissions} groups={groups} onSaved={() => undefined} onDeleted={() => setCurrent(roles[0]?.id ?? null)} />
        ) : null}
      </div>
      <PermissionMatrix roles={roles} permissions={permissions} groups={groups} label={label} />
    </div>
  );
}

function RoleEditor({ role, permissions, groups, onSaved, onDeleted }: { role?: RoleRow; permissions: PermissionRow[]; groups: string[]; onSaved: (id: string) => void; onDeleted?: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ key: role?.key ?? "", name: role?.name ?? "", nameSo: role?.nameSo ?? "", description: role?.description ?? "", permissions: new Set(role?.permissions ?? ["dashboard.view"]) });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const toggle = (key: string, on: boolean) => {
    const next = new Set(form.permissions);
    if (on) next.add(key);
    else next.delete(key);
    setForm({ ...form, permissions: next });
  };
  const dirty =
    !role ||
    form.key !== role.key ||
    form.name !== role.name ||
    form.nameSo !== (role.nameSo ?? "") ||
    form.description !== (role.description ?? "") ||
    form.permissions.size !== role.permissions.length ||
    role.permissions.some((p) => !form.permissions.has(p));
  const save = () =>
    start(async () => {
      const res = await saveRoleAction(role?.id ?? null, { ...form, permissions: [...form.permissions] });
      if (!res.ok) setErrors(res.error.fieldErrors ?? {});
      const data = handleResult(res, t("common.saved"));
      if (data) {
        setErrors({});
        onSaved(data.id);
        router.refresh();
      }
    });
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-label={role ? role.name : t("admin.newRole")}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field id="r-key" label={t("admin.roleKey")} required error={errors.key?.[0]} hint={role?.isSystem ? "System role — key is fixed" : "e.g. REGIONAL_REVIEWER"}>
          <Input id="r-key" value={form.key} readOnly={role?.isSystem} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} className="font-mono" />
        </Field>
        <Field id="r-name" label={t("admin.roleName")} required error={errors.name?.[0]}>
          <Input id="r-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field id="r-name-so" label={`${t("admin.roleName")} (${t("common.somali")})`}>
          <Input id="r-name-so" value={form.nameSo} onChange={(e) => setForm({ ...form, nameSo: e.target.value })} />
        </Field>
        <Field id="r-desc" label={t("common.description")}>
          <Textarea id="r-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">
          {t("admin.permissions")} <span className="num font-normal text-muted-foreground">({form.permissions.size})</span>
        </h3>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {groups.map((g) => (
            <fieldset key={g} className="rounded-md border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">{g}</legend>
              <div className="space-y-2">
                {permissions
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <label key={p.key} className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox checked={form.permissions.has(p.key)} onCheckedChange={(c) => toggle(p.key, c === true)} className="mt-0.5" />
                      <span>
                        {p.name}
                        <span className="block font-mono text-[10px] text-muted-foreground">{p.key}</span>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
        {role && !role.isSystem ? (
          <ConfirmDialog
            destructive
            trigger={
              <Button variant="outline" size="sm" disabled={role.users > 0} title={role.users > 0 ? `${role.users} user(s)` : undefined}>
                <Trash2 aria-hidden />
                {t("admin.deleteRole")}
              </Button>
            }
            title={t("admin.deleteRole")}
            description={`${role.key} — ${role.name}`}
            onConfirm={async () => {
              if (handleResult(await deleteRoleAction(role.id), t("common.saved"))) {
                onDeleted?.();
                router.refresh();
              }
            }}
          />
        ) : (
          <span />
        )}
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("admin.saveRole")}
        </Button>
      </div>
    </section>
  );
}

/** Read-only overview of which role holds which permission. */
function PermissionMatrix({ roles, permissions, groups, label }: { roles: RoleRow[]; permissions: PermissionRow[]; groups: string[]; label: (r: RoleRow) => string }) {
  const { t } = useT();
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="perm-matrix">
      <h2 id="perm-matrix" className="border-b px-4 py-3 text-sm font-semibold">
        {t("admin.permissionMatrix")}
      </h2>
      <div className="relative max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-20 border-b bg-card px-3 py-2 text-left font-medium">
                {t("admin.permissions")}
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="h-28 border-b px-1 align-bottom font-medium">
                  <span className="inline-block max-h-28 [writing-mode:vertical-rl] rotate-180 text-left whitespace-nowrap">{label(r)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <MatrixGroup key={g} group={g} roles={roles} permissions={permissions.filter((p) => p.group === g)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixGroup({ group, roles, permissions }: { group: string; roles: RoleRow[]; permissions: PermissionRow[] }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={roles.length + 1} className="sticky left-0 border-b bg-muted/60 px-3 py-1 text-left font-semibold text-muted-foreground">
          {group}
        </th>
      </tr>
      {permissions.map((p) => (
        <tr key={p.key} className="hover:bg-muted/40">
          <th scope="row" className="sticky left-0 border-b bg-card px-3 py-1 text-left font-normal">
            {p.name}
          </th>
          {roles.map((r) => {
            const has = r.permissions.includes(p.key);
            return (
              <td key={r.id} className="border-b text-center">
                {has ? <Check className="mx-auto size-3.5 text-primary" aria-label="Yes" /> : <span className="sr-only">No</span>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleResult } from "@/lib/action-client";
import { useT } from "@/lib/i18n/client";
import { saveCodeMappingAction } from "../actions";

interface Mapping {
  id: string;
  scheme: string;
  sourceCode: string;
  sourceName: string | null;
  target: string;
  targetCodeId: string;
  notes: string | null;
}

/** Crosswalk between codes in source documents (e.g. the 2026 summary tables) and the chart of accounts. */
export function CodeMappings({ mappings, targets }: { mappings: Mapping[]; targets: { value: string; label: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState({ scheme: mappings[0]?.scheme ?? "SHAXDA_SUMMARY_2026", sourceCode: "", sourceName: "", targetCodeId: "", notes: "" });
  const save = (m: typeof draft) =>
    start(async () => {
      if (handleResult(await saveCodeMappingAction({ ...m, sourceName: m.sourceName || null, notes: m.notes || null }), t("common.saved"))) {
        setDraft({ ...draft, sourceCode: "", sourceName: "", targetCodeId: "", notes: "" });
        router.refresh();
      }
    });
  return (
    <div className="space-y-4">
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("admin.sourceScheme")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("admin.sourceCode")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.name")}</th>
              <th scope="col" className="w-72 px-3 py-2 text-left font-medium">{t("admin.targetCode")}</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("common.notes")}</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{m.scheme}</td>
                <td className="num px-3 py-2 font-medium">{m.sourceCode}</td>
                <td className="px-3 py-2">{m.sourceName}</td>
                <td className="px-3 py-1.5">
                  <Select value={m.targetCodeId} onValueChange={(v) => save({ scheme: m.scheme, sourceCode: m.sourceCode, sourceName: m.sourceName ?? "", targetCodeId: v, notes: m.notes ?? "" })} disabled={pending}>
                    <SelectTrigger className="h-8 w-full" aria-label={`${t("admin.targetCode")} ${m.sourceCode}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{m.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className="rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t("admin.newMapping")}</legend>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="m-scheme">{t("admin.sourceScheme")}</Label>
            <Input id="m-scheme" className="h-8" value={draft.scheme} onChange={(e) => setDraft({ ...draft, scheme: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-code">{t("admin.sourceCode")}</Label>
            <Input id="m-code" className="h-8" value={draft.sourceCode} onChange={(e) => setDraft({ ...draft, sourceCode: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-name">{t("common.name")}</Label>
            <Input id="m-name" className="h-8" value={draft.sourceName} onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{t("admin.targetCode")}</Label>
            <Select value={draft.targetCodeId} onValueChange={(v) => setDraft({ ...draft, targetCodeId: v })}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" size="sm" disabled={pending || !draft.sourceCode || !draft.targetCodeId || !draft.scheme} onClick={() => save(draft)}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              {t("common.add")}
            </Button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}

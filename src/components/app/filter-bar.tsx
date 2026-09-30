"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useUrlState } from "./url-state";

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterDef =
  | { type: "select"; key: string; label: string; options: FilterOption[]; allLabel?: string; width?: string; required?: boolean; defaultValue?: string }
  | { type: "search"; key: string; label: string; placeholder?: string }
  | { type: "date"; key: string; label: string };

const ALL = "__all__";

/** Filters that read and write URL search params, so they combine, persist on reload and can be shared. */
export function FilterBar({ filters, className, children }: { filters: FilterDef[]; className?: string; children?: React.ReactNode }) {
  const { t } = useT();
  const { params, set } = useUrlState();
  const active = filters.filter((f) => !(f.type === "select" && f.required) && params.get(f.key));

  return (
    <div className={cn("no-print flex flex-wrap items-end gap-2", className)} role="search">
      {filters.map((f) =>
        f.type === "search" ? (
          <SearchInput key={f.key} paramKey={f.key} label={f.label} placeholder={f.placeholder ?? t("common.searchPlaceholder")} />
        ) : f.type === "date" ? (
          <div key={f.key} className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor={`filter-${f.key}`}>
              {f.label}
            </label>
            <Input id={`filter-${f.key}`} type="date" className="h-7 w-40 text-sm" value={params.get(f.key) ?? ""} onChange={(e) => set({ [f.key]: e.target.value || null })} />
          </div>
        ) : (
          <div key={f.key} className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor={`filter-${f.key}`}>
              {f.label}
            </label>
            <Select value={params.get(f.key) ?? f.defaultValue ?? (f.required ? f.options[0]?.value : ALL)} onValueChange={(v) => set({ [f.key]: v === ALL ? null : v })}>
              <SelectTrigger id={`filter-${f.key}`} size="sm" className={cn("min-w-32", f.width ?? "w-44")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!f.required ? <SelectItem value={ALL}>{f.allLabel ?? t("common.all")}</SelectItem> : null}
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ),
      )}
      {children}
      {active.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(active.map((f) => [f.key, null])))}>
          <X aria-hidden />
          {t("common.clearFilters")}
        </Button>
      ) : null}
    </div>
  );
}

export function SearchInput({ paramKey = "q", label, placeholder, className }: { paramKey?: string; label?: string; placeholder?: string; className?: string }) {
  const { params, set } = useUrlState();
  const urlValue = params.get(paramKey) ?? "";
  const [value, setValue] = useState(urlValue);
  // Follow URL changes made elsewhere (back button, "clear filters") without an effect.
  const [synced, setSynced] = useState(urlValue);
  if (urlValue !== synced) {
    setSynced(urlValue);
    setValue(urlValue);
  }
  useEffect(() => {
    if (value === urlValue) return;
    const timer = setTimeout(() => set({ [paramKey]: value.trim() || null }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on value only
  }, [value]);
  return (
    <div className={cn("space-y-1", className)}>
      {label ? (
        <label className="block text-xs text-muted-foreground" htmlFor={`search-${paramKey}`}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={`search-${paramKey}`} type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="h-7 w-56 pl-8 text-sm" />
      </div>
    </div>
  );
}

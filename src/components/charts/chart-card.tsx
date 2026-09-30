"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface ChartTable {
  columns: { label: string; align?: "left" | "right" }[];
  rows: (string | number)[][];
}

/**
 * Card wrapper for every chart. Each chart ships with a table view (the accessible
 * equivalent), so values are never available only through colour or tooltips.
 */
export function ChartCard({
  title,
  description,
  table,
  actions,
  children,
  className,
  height = 280,
}: {
  title: string;
  description?: React.ReactNode;
  table?: ChartTable;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const { t } = useT();
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)} aria-label={title}>
      <header className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="no-print flex shrink-0 items-center gap-1">
          {actions}
          {table ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={view === "table"}
              aria-label={view === "chart" ? `${title}: table view` : `${title}: chart view`}
              onClick={() => setView(view === "chart" ? "table" : "chart")}
            >
              {view === "chart" ? <Table2 aria-hidden /> : <BarChart3 aria-hidden />}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="flex-1 px-2 pt-2 pb-3">
        {view === "chart" || !table ? (
          <div style={{ height }} className="w-full">
            {children}
          </div>
        ) : (
          <div className="relative max-h-[22rem] overflow-auto px-2">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b">
                  {table.columns.map((c, i) => (
                    <th key={i} scope="col" className={cn("py-1.5 font-medium", c.align === "right" ? "text-right" : "text-left")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.map((v, j) => (
                      <td key={j} className={cn("py-1.5", table.columns[j]?.align === "right" && "num text-right")}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}

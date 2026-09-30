import { StatusBadge } from "@/components/app/status-badge";
import { formatCalendarDate, formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ColumnType, ReportResult } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

const numeric = (t: ColumnType) => t === "money" || t === "percent" || t === "number";

function Cell({ value, type, cfg, blankEmpty }: { value: unknown; type: ColumnType; cfg: { symbol: string; timezone: string; locale: "en" | "so" }; blankEmpty?: boolean }) {
  if (value === null || value === undefined || value === "") return <>{numeric(type) && !blankEmpty ? "—" : ""}</>;
  switch (type) {
    case "money":
      return <>{formatMoney(Number(value), { currencySymbol: cfg.symbol })}</>;
    case "percent":
      return <>{formatPercent(Number(value))}</>;
    case "number":
      return <>{formatNumber(Number(value))}</>;
    case "date":
      return <>{formatCalendarDate(value as Date | string, { locale: cfg.locale })}</>;
    case "datetime":
      return <>{formatDateTime(value as Date | string, { locale: cfg.locale, timezone: cfg.timezone })}</>;
    case "status":
      return <StatusBadge status={String(value)} />;
    case "code":
      return <span className="num">{String(value)}</span>;
    default:
      return <>{String(value)}</>;
  }
}

/** Screen and print rendering of a report result (the same data as the PDF/Excel/CSV exports). */
export function ReportView({ report, cfg, labels }: { report: ReportResult; cfg: { symbol: string; timezone: string; locale: "en" | "so" }; labels: { total: string; noRows: string } }) {
  return (
    <article className="space-y-5" aria-label={report.title}>
      <header className="hidden print:block">
        <h1 className="text-xl font-semibold">{report.title}</h1>
        <p className="text-sm">{report.subtitle}</p>
      </header>
      {report.filters.length ? <p className="text-xs text-muted-foreground">{report.filters.join(" · ")}</p> : null}
      {report.summary?.length ? (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5">
          {report.summary.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="num text-base font-semibold">
                <Cell value={s.value} type={s.type} cfg={cfg} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {report.sections.map((s, i) => (
        <section key={i} className="rounded-lg border bg-card print:break-inside-auto print:border-0" aria-label={s.title ?? report.title}>
          {s.title ? <h2 className="border-b px-4 py-3 text-sm font-semibold print:px-0">{s.title}</h2> : null}
          {s.note ? <p className="px-4 pt-2 text-xs text-muted-foreground print:px-0">{s.note}</p> : null}
          <div className="relative overflow-x-auto">
            <table className={cn("w-full text-sm", s.columns.length > 8 ? "min-w-[1100px] text-xs" : "min-w-[640px]")}>
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="border-b">
                  {s.columns.map((c) => (
                    <th key={c.key} scope="col" className={cn("px-3 py-2 font-medium", numeric(c.type) ? "text-right" : "text-left")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.length === 0 ? (
                  <tr>
                    <td colSpan={s.columns.length} className="px-3 py-6 text-center text-muted-foreground">
                      {labels.noRows}
                    </td>
                  </tr>
                ) : null}
                {s.rows.map((r, j) => (
                  <tr key={j} className="border-b last:border-0 hover:bg-muted/30">
                    {s.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-1.5 align-top", numeric(c.type) && "num text-right whitespace-nowrap")}>
                        <Cell value={r[c.key]} type={c.type} cfg={cfg} />
                      </td>
                    ))}
                  </tr>
                ))}
                {s.totals ? (
                  <tr className="bg-muted/50 font-semibold">
                    {s.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2", numeric(c.type) && "num text-right whitespace-nowrap")}>
                        <Cell value={s.totals![c.key]} type={c.type === "status" ? "text" : c.type} cfg={cfg} blankEmpty />
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {report.notes?.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </article>
  );
}

"use client";

/**
 * Chart primitives (Recharts) following the data-visualisation rules of this project:
 * one y-axis, thin marks (bars ≤ 24px with 4px rounded data-ends, 2px lines),
 * hairline grid, legend for ≥ 2 series, series colours from the validated palette
 * tokens (--chart-1 … --chart-8), text in text tokens, hover tooltips.
 */
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useFormat } from "@/components/providers";

export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];
const AXIS = { stroke: "var(--chart-axis)", fontSize: 11 } as const;
const GRID = "var(--chart-grid)";

function useCompact() {
  const fmt = useFormat();
  return (v: number) => fmt.compact(v);
}

function TooltipBox({ active, payload, label, format }: TooltipContentProps<number, string> & { format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined ? <p className="mb-1 font-medium">{String(label)}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
            <span className="num font-medium">{format(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  href?: string;
  /** Optional full label for the tooltip when the axis label is truncated. */
  fullLabel?: string;
}

/** Horizontal single-series bars (rankings); bars link to drill-down pages when href is set. */
export function HBarChart({ data, format, name, color = SERIES[0], labelWidth = 150 }: { data: BarDatum[]; format?: (v: number) => string; name: string; color?: string; labelWidth?: number }) {
  const router = useRouter();
  const compact = useCompact();
  const fmt = useFormat();
  const f = format ?? ((v: number) => fmt.money(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={compact} {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...AXIS} tickLine={false} axisLine={false} interval={0} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} label={(p.payload?.[0]?.payload as BarDatum | undefined)?.fullLabel ?? p.label} format={f} />} />
        <Bar
          dataKey="value"
          name={name}
          fill={color}
          maxBarSize={22}
          radius={[0, 4, 4, 0]}
          cursor={data.some((d) => d.href) ? "pointer" : undefined}
          onClick={(d: { payload?: BarDatum }) => d.payload?.href && router.push(d.payload.href)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

/** Vertical grouped columns (2–4 series). */
export function GroupedBarChart({ data, xKey, series, format }: { data: Record<string, string | number>[]; xKey: string; series: SeriesDef[]; format?: (v: number) => string }) {
  const compact = useCompact();
  const fmt = useFormat();
  const f = format ?? ((v: number) => fmt.money(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tickFormatter={compact} {...AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} format={f} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? SERIES[i]} maxBarSize={24} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Multi-line trend (e.g. planned vs actual by month) with crosshair tooltip. */
export function TrendChart({ data, xKey, series, format }: { data: Record<string, string | number | null>[]; xKey: string; series: SeriesDef[]; format?: (v: number) => string }) {
  const compact = useCompact();
  const fmt = useFormat();
  const f = format ?? ((v: number) => fmt.money(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tickFormatter={compact} {...AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} format={f} />} />
        {series.length > 1 ? <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} /> : null}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? SERIES[i]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            connectNulls={false}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Diverging bars around zero (e.g. variance vs plan): blue above, red below. */
export function DivergingBarChart({ data, name, format, labelWidth = 120 }: { data: BarDatum[]; name: string; format?: (v: number) => string; labelWidth?: number }) {
  const router = useRouter();
  const compact = useCompact();
  const fmt = useFormat();
  const f = format ?? ((v: number) => fmt.money(v, { signed: true }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={compact} {...AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...AXIS} tickLine={false} axisLine={false} interval={0} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <ReferenceLine x={0} stroke="var(--chart-axis)" />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} format={f} />} />
        <Bar dataKey="value" name={name} maxBarSize={20} cursor={data.some((d) => d.href) ? "pointer" : undefined} onClick={(d: { payload?: BarDatum }) => d.payload?.href && router.push(d.payload.href)}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.value >= 0 ? "var(--chart-1)" : "var(--chart-8)"} radius={(d.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4]) as unknown as number} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal progress meter (e.g. execution rate) with the same-ramp track. */
export function Meter({ value, max = 100, label }: { value: number | null; max?: number; label: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? undefined}>
      <div className="h-2 overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

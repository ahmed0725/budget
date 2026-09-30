"use client";

import { ChartCard } from "@/components/charts/chart-card";
import { DivergingBarChart, GroupedBarChart, HBarChart, TrendChart, type BarDatum, type SeriesDef } from "@/components/charts/charts";
import { useFormat } from "@/components/providers";

/** Horizontal bars (ranked magnitudes) with a table view; bars link to the next drill level. */
export function BarCard({ title, description, data, valueLabel, nameLabel, labelWidth }: { title: string; description?: string; data: BarDatum[]; valueLabel: string; nameLabel: string; labelWidth?: number }) {
  const fmt = useFormat();
  return (
    <ChartCard title={title} description={description} table={{ columns: [{ label: nameLabel }, { label: valueLabel, align: "right" }], rows: data.map((d) => [d.fullLabel ?? d.label, fmt.money(d.value)]) }}>
      <HBarChart data={data} name={valueLabel} format={(v) => fmt.money(v, { compact: true })} labelWidth={labelWidth} />
    </ChartCard>
  );
}

/** Signed values (increase/decrease, over/under) around zero. */
export function DivergingCard({ title, description, data, valueLabel, nameLabel }: { title: string; description?: string; data: BarDatum[]; valueLabel: string; nameLabel: string }) {
  const fmt = useFormat();
  return (
    <ChartCard title={title} description={description} table={{ columns: [{ label: nameLabel }, { label: valueLabel, align: "right" }], rows: data.map((d) => [d.fullLabel ?? d.label, fmt.money(d.value, { signed: true })]) }}>
      <DivergingBarChart data={data} name={valueLabel} format={(v) => fmt.money(v, { compact: true, signed: true })} />
    </ChartCard>
  );
}

export function TrendCard({ title, description, data, xKey, xLabel, series }: { title: string; description?: string; data: Record<string, string | number | null>[]; xKey: string; xLabel: string; series: SeriesDef[] }) {
  const fmt = useFormat();
  return (
    <ChartCard
      title={title}
      description={description}
      table={{ columns: [{ label: xLabel }, ...series.map((s) => ({ label: s.label, align: "right" as const }))], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => (d[s.key] === null || d[s.key] === undefined ? "—" : fmt.money(Number(d[s.key]))))]) }}
    >
      <TrendChart data={data} xKey={xKey} series={series} format={(v) => fmt.money(v, { compact: true })} />
    </ChartCard>
  );
}

export function GroupedCard({ title, description, data, xKey, xLabel, series }: { title: string; description?: string; data: Record<string, string | number>[]; xKey: string; xLabel: string; series: SeriesDef[] }) {
  const fmt = useFormat();
  return (
    <ChartCard
      title={title}
      description={description}
      table={{ columns: [{ label: xLabel }, ...series.map((s) => ({ label: s.label, align: "right" as const }))], rows: data.map((d) => [String(d[xKey]), ...series.map((s) => fmt.money(Number(d[s.key] ?? 0)))]) }}
    >
      <GroupedBarChart data={data} xKey={xKey} series={series} format={(v) => fmt.money(v, { compact: true })} />
    </ChartCard>
  );
}

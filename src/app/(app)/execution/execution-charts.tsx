"use client";

import { ChartCard } from "@/components/charts/chart-card";
import { GroupedBarChart, TrendChart } from "@/components/charts/charts";
import { useFormat } from "@/components/providers";

export function ExecutionTrend({ title, description, data, labels }: { title: string; description: string; data: { month: string; planned: number; actual: number | null }[]; labels: { planned: string; actual: string; month: string } }) {
  const fmt = useFormat();
  const m = (v: number | null) => (v === null ? "—" : fmt.money(v));
  return (
    <ChartCard title={title} description={description} table={{ columns: [{ label: labels.month }, { label: labels.planned, align: "right" }, { label: labels.actual, align: "right" }], rows: data.map((r) => [r.month, m(r.planned), m(r.actual)]) }}>
      <TrendChart
        data={data}
        xKey="month"
        series={[
          { key: "planned", label: labels.planned },
          { key: "actual", label: labels.actual },
        ]}
      />
    </ChartCard>
  );
}

export function MonthlyBars({ title, description, data, labels }: { title: string; description: string; data: { month: string; target: number; actual: number }[]; labels: { target: string; actual: string; month: string } }) {
  const fmt = useFormat();
  return (
    <ChartCard title={title} description={description} table={{ columns: [{ label: labels.month }, { label: labels.target, align: "right" }, { label: labels.actual, align: "right" }], rows: data.map((r) => [r.month, fmt.money(r.target), fmt.money(r.actual)]) }}>
      <GroupedBarChart
        data={data}
        xKey="month"
        series={[
          { key: "target", label: labels.target },
          { key: "actual", label: labels.actual },
        ]}
      />
    </ChartCard>
  );
}

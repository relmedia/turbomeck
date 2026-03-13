"use client";

import { useEffect, useState } from "react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";

const chartConfig = {
  totalt: {
    label: "Totalt",
    color: "var(--chart-1)",
  },
  successfull: {
    label: "Slutförda",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

type RevenueRow = { month: string; monthLabel: string; totalt: number; successfull: number };

const AppBarChart = () => {
  const [data, setData] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/revenue")
      .then((res) => {
        if (!res.ok) throw new Error("Kunde inte hämta data");
        return res.json();
      })
      .then((rows: RevenueRow[]) => {
        if (!cancelled) setData(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ett fel uppstod");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = data.map((r) => ({
    month: r.monthLabel,
    totalt: r.totalt,
    successfull: r.successfull,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-8">
        {error}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div>
        <h1 className="text-lg font-medium mb-6">Totala intäkter</h1>
        <p className="text-sm text-muted-foreground py-8">Ingen orderdata de senaste 6 månaderna.</p>
      </div>
    );
  }

  return (
    <div className="">
      <h1 className="text-lg font-medium mb-6">Totala intäkter</h1>
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => (value && String(value).length >= 3 ? String(value).slice(0, 3) : value)}
          />
          <YAxis
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="totalt" fill="var(--color-totalt)" radius={4} />
          <Bar
            dataKey="successfull"
            fill="var(--color-successfull)"
            radius={4}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default AppBarChart;

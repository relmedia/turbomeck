"use client";

import { useEffect, useState } from "react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@repo/ui/components/skeleton";

const chartConfig = {
  mobile: {
    label: "Mobil",
    color: "var(--chart-1)",
  },
  desktop: {
    label: "Dator",
    color: "var(--chart-2)",
  },
  tablet: {
    label: "Surfplatta",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

type VisitorRow = { month: string; monthLabel: string; mobile: number; desktop: number; tablet: number };

const AppAreaChart = () => {
  const [data, setData] = useState<VisitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/visitors")
      .then((res) => {
        if (!res.ok) throw new Error("Kunde inte hämta data");
        return res.json();
      })
      .then((rows: unknown) => {
        if (!cancelled) setData(Array.isArray(rows) ? (rows as VisitorRow[]) : []);
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
    mobile: r.mobile,
    desktop: r.desktop,
    tablet: r.tablet,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
        <div className="flex flex-wrap justify-center gap-3">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
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
        <h1 className="text-lg font-medium mb-6">Totalt antal besökare</h1>
        <p className="text-sm text-muted-foreground py-8">Ingen besöksdata de senaste 6 månaderna.</p>
      </div>
    );
  }

  return (
    <div className="">
      <h1 className="text-lg font-medium mb-6">Totalt antal besökare</h1>
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <AreaChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => (value && String(value).length >= 3 ? String(value).slice(0, 3) : value)}
          />
          <YAxis tickLine={false} tickMargin={10} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <defs>
            <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-mobile)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-mobile)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-desktop)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-desktop)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="fillTablet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-tablet)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-tablet)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            dataKey="mobile"
            type="natural"
            fill="url(#fillMobile)"
            fillOpacity={0.4}
            stroke="var(--color-mobile)"
            stackId="a"
          />
          <Area
            dataKey="tablet"
            type="natural"
            fill="url(#fillTablet)"
            fillOpacity={0.4}
            stroke="var(--color-tablet)"
            stackId="a"
          />
          <Area
            dataKey="desktop"
            type="natural"
            fill="url(#fillDesktop)"
            fillOpacity={0.4}
            stroke="var(--color-desktop)"
            stackId="a"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

export default AppAreaChart;

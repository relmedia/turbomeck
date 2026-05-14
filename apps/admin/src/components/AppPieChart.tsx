"use client";

import { useEffect, useState } from "react";
import { Label, Pie, PieChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/ui/components/chart";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@repo/ui/components/skeleton";

const chartConfig = {
  visitors: {
    label: "Besökare",
  },
  chrome: {
    label: "Chrome",
    color: "var(--chart-1)",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-2)",
  },
  firefox: {
    label: "Firefox",
    color: "var(--chart-3)",
  },
  edge: {
    label: "Edge",
    color: "var(--chart-4)",
  },
  other: {
    label: "Övriga",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const BROWSER_FILL: Record<string, string> = {
  chrome: "var(--color-chrome)",
  safari: "var(--color-safari)",
  firefox: "var(--color-firefox)",
  edge: "var(--color-edge)",
  other: "var(--color-other)",
};

const BROWSER_LABEL: Record<string, string> = {
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  other: "Övriga",
};

type BrowserRow = { browser: string; visitors: number };

const AppPieChart = () => {
  const [data, setData] = useState<BrowserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [change, setChange] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/browsers")
      .then((res) => {
        if (!res.ok) throw new Error("Kunde inte hämta data");
        return res.json();
      })
      .then((json: { data: BrowserRow[]; total: number; change: number }) => {
        if (!cancelled) {
          setData(json.data ?? []);
          setTotal(json.total ?? 0);
          setChange(json.change ?? 0);
        }
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

  const chartData = data
    .filter((r) => r.visitors > 0)
    .map((r) => ({
      browser: BROWSER_LABEL[r.browser] ?? r.browser,
      visitors: r.visitors,
      fill: BROWSER_FILL[r.browser] ?? BROWSER_FILL.other,
    }));

  const totalVisitors = chartData.reduce((acc, curr) => acc + curr.visitors, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-44" />
        <div className="mx-auto flex aspect-square h-[220px] max-h-[250px] w-full max-w-[220px] items-center justify-center">
          <Skeleton className="size-full max-h-[250px] rounded-full" />
        </div>
        <div className="flex justify-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
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
        <h1 className="text-lg font-medium mb-6">Webbläsaranvändning</h1>
        <p className="text-sm text-muted-foreground py-8">Ingen besöksdata de senaste 6 månaderna.</p>
      </div>
    );
  }

  return (
    <div className="">
      <h1 className="text-lg font-medium mb-6">Webbläsaranvändning</h1>
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[250px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel />}
          />
          <Pie
            data={chartData}
            dataKey="visitors"
            nameKey="browser"
            innerRadius={60}
            strokeWidth={5}
          >
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-3xl font-bold"
                      >
                        {totalVisitors.toLocaleString("sv-SE")}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-muted-foreground"
                      >
                        Besökare
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-4 flex flex-col gap-2 items-center">
        <div className="flex items-center gap-2 font-medium leading-none">
          {change >= 0 ? (
            <>
              Uppåt med {change.toLocaleString("sv-SE")} % denna månad{" "}
              <TrendingUp className="h-4 w-4 text-green-500" />
            </>
          ) : (
            <>
              Ned {Math.abs(change).toLocaleString("sv-SE")} % denna månad{" "}
              <TrendingDown className="h-4 w-4 text-red-500" />
            </>
          )}
        </div>
        <div className="leading-none text-muted-foreground">
          Visar totalt antal besökare de senaste 6 månaderna
        </div>
      </div>
    </div>
  );
};

export default AppPieChart;

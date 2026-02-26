"use client";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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

const chartData = [
  { month: "Januari", totalt: 186, successfull: 80 },
  { month: "Februari", totalt: 305, successfull: 200 },
  { month: "Mars", totalt: 237, successfull: 120 },
  { month: "April", totalt: 173, successfull: 100 },
  { month: "Mai", totalt: 209, successfull: 130 },
  { month: "Juni", totalt: 214, successfull: 140 },
];

const AppBarChart = () => {
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
            tickFormatter={(value) => value.slice(0, 3)}
          />
          <YAxis tickLine={false} tickMargin={10} axisLine={false} />
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

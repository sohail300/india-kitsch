"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
  /** Pre-formatted for display (e.g. "₹2,099.00") - computed server-side
   * since formatters like formatINR live in a server-only module and a
   * function prop can't cross the Server->Client boundary at all. */
  label: string;
}

function formatDateTick(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A single-series trend chart on Recharts (via shadcn's chart wrapper,
 * `npx shadcn add chart`) - dataviz skill: "trend over time -> line; area
 * for a single series" / "compare magnitude -> bar". One hue (--primary)
 * throughout; a single series needs no legend box, the title names it.
 */
export function TrendChart({
  title,
  points,
  mode,
  color = "var(--primary)",
}: {
  title: string;
  points: TrendPoint[];
  mode: "area" | "bar";
  /** Any valid CSS color - defaults to the app accent when not given. */
  color?: string;
}) {
  const config = {
    value: { label: title, color },
  } satisfies ChartConfig;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ChartContainer config={config} className="mt-3 aspect-auto h-40 w-full">
        {mode === "area" ? (
          <AreaChart data={points} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              fontSize={11}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => formatDateTick(String(label))}
                  formatter={(_value, _name, item) => item.payload.label}
                />
              }
            />
            <Area
              dataKey="value"
              type="monotone"
              fill="var(--color-value)"
              fillOpacity={0.1}
              stroke="var(--color-value)"
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <BarChart data={points} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              fontSize={11}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => formatDateTick(String(label))}
                  formatter={(_value, _name, item) => item.payload.label}
                />
              }
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} maxBarSize={24} />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}

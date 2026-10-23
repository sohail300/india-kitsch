import { cn } from "@/lib/utils";

export interface Metric {
  label: string;
  value: string;
  /** "attention" pulls a metric out from the rest visually - reserve for
   * numbers that call for action, not just information (docs/critique
   * finding: identical-weight stat cards hid which one actually mattered). */
  tone?: "default" | "attention";
  /** Any valid CSS color - overrides `tone`, for tying a metric to a
   * specific series' color elsewhere on the page (e.g. its trend chart). */
  color?: string;
  /** A muted supporting line under the value (e.g. "₹4,250 discount"). */
  detail?: string;
}

/** A dense, single-row metric strip - replaces a grid of identical
 * icon+label+number cards (the "hero metric layout" pattern .impeccable.md
 * explicitly calls out to avoid). One flat surface, hairline dividers
 * between values, no per-metric chrome or icon.
 *
 * `divide-x` only knows "every child but the first", not "every child but
 * the first in its row" - with `flex-wrap`, the item that starts a wrapped
 * row still gets a stray left border floating at the edge of the strip. A
 * plain `grid` sidesteps that: single column (real `divide-y`, no wrapping
 * ambiguity) below `sm`, a single row of everything from `sm` up (real
 * `divide-x`, also no wrapping) - never a state in between where a row
 * could break mid-line. */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="px-5 py-4"
          style={
            metric.color
              ? { backgroundColor: `color-mix(in oklch, ${metric.color} 8%, var(--card))` }
              : undefined
          }
        >
          <p className="text-sm text-muted-foreground">{metric.label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              !metric.color &&
                (metric.tone === "attention" ? "text-destructive" : "text-foreground"),
            )}
            style={metric.color ? { color: metric.color } : undefined}
          >
            {metric.value}
          </p>
          {metric.detail ? (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{metric.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

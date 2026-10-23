/**
 * Plain data, deliberately NOT in dashboard-range-select.tsx: that file is
 * "use client", and a Server Component importing a non-component export
 * from a client module gets an opaque client reference back, not the real
 * value - `RANGE_OPTIONS.some(...)` in page.tsx threw
 * "RANGE_OPTIONS.some is not a function" for exactly this reason. Both the
 * server page and the client select import this shared module instead.
 */
export const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "custom", label: "Custom Range" },
] as const;

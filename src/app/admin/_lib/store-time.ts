import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * The store's calendar. Admin pages run on the server, whose own timezone is
 * UTC in production - so "today", day boundaries and per-day chart buckets
 * must be computed in the store's zone explicitly, never with
 * `setHours(0,0,0,0)` or `new Date("yyyy-MM-dd")` (both use the host zone /
 * UTC). India has no DST, so a calendar day is always exactly 24 h.
 */
export const STORE_TIME_ZONE = "Asia/Kolkata";
const STORE_UTC_OFFSET = "+05:30";
const DAY_MS = 86_400_000;

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The store-calendar date an instant falls on, as `yyyy-MM-dd`. */
export function storeDay(instant: Date): string {
  return dayFormat.format(instant);
}

/** The instant a store-calendar day (`yyyy-MM-dd`) starts. */
export function startOfStoreDay(day: string): Date {
  return new Date(`${day}T00:00:00${STORE_UTC_OFFSET}`);
}

/** The last instant of a store-calendar day (inclusive end of a date range). */
export function endOfStoreDay(day: string): Date {
  return new Date(startOfStoreDay(day).getTime() + DAY_MS - 1);
}

/** Midnight (store time) `days` calendar days before the day `now` falls on. */
export function storeDaysAgo(days: number, now: Date = new Date()): Date {
  return new Date(startOfStoreDay(storeDay(now)).getTime() - days * DAY_MS);
}

/** Midnight (store time) `months` calendar months before the day `now` falls on. */
export function storeMonthsAgo(months: number, now: Date = new Date()): Date {
  const [y, m, d] = storeDay(now).split("-").map(Number) as [number, number, number];
  // Date.UTC normalizes overflow the same way setMonth does (e.g. Mar 31 - 1 month -> Mar 3).
  const shifted = new Date(Date.UTC(y, m - 1 - months, d));
  return startOfStoreDay(shifted.toISOString().slice(0, 10));
}

/** Every store-calendar day from `from` to `until` inclusive, as `yyyy-MM-dd`. */
export function storeDaysBetween(from: Date, until: Date): string[] {
  const days: string[] = [];
  const last = storeDay(until);
  for (let t = startOfStoreDay(storeDay(from)).getTime(); ; t += DAY_MS) {
    const day = storeDay(new Date(t));
    days.push(day);
    if (day >= last) break;
  }
  return days;
}

/**
 * SQL: the store-calendar day a column's instant falls on, as `yyyy-MM-dd`,
 * for grouping. `timestamptz` columns convert directly; Better Auth's
 * `timestamp` (no tz) columns hold UTC wall-clock time, so they're first
 * marked as UTC, then converted.
 */
export function storeDaySql(
  column: AnyColumn,
  { withTimezone }: { withTimezone: boolean },
): SQL<string> {
  const instant = withTimezone ? sql`${column}` : sql`(${column} at time zone 'UTC')`;
  return sql<string>`to_char(${instant} at time zone ${sql.raw(`'${STORE_TIME_ZONE}'`)}, 'YYYY-MM-DD')`;
}

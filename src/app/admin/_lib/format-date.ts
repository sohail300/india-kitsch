// Admin pages render on the server, so dates are pinned to the store's
// timezone rather than whatever zone the host runs in (UTC in production).
import { STORE_TIME_ZONE as TIME_ZONE } from "./store-time";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sep 25, 2026" */
export function formatAdminDate(date: Date): string {
  return dateFormat.format(date);
}

/** "Sep 25, 2026 · 3:40 pm" */
export function formatAdminDateTime(date: Date): string {
  const parts = dateTimeFormat.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} · ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

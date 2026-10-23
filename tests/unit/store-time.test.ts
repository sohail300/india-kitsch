import { describe, expect, it } from "vitest";
import {
  endOfStoreDay,
  startOfStoreDay,
  storeDay,
  storeDaysAgo,
  storeDaysBetween,
  storeMonthsAgo,
} from "@/app/admin/_lib/store-time";

// Instants are given in UTC ("Z") so the expectations hold whatever timezone
// the machine running the tests is in — the whole point of these helpers.
describe("store-time (Asia/Kolkata, UTC+05:30)", () => {
  it("puts 00:10 IST on its own calendar day, not the previous UTC day", () => {
    // 2026-09-24T18:40Z is 2026-09-25 00:10 IST.
    expect(storeDay(new Date("2026-09-24T18:40:00Z"))).toBe("2026-09-25");
    expect(storeDay(new Date("2026-09-24T18:20:00Z"))).toBe("2026-09-24");
  });

  it("starts and ends store days at IST midnight", () => {
    expect(startOfStoreDay("2026-09-25").toISOString()).toBe("2026-09-24T18:30:00.000Z");
    expect(endOfStoreDay("2026-09-25").toISOString()).toBe("2026-09-25T18:29:59.999Z");
  });

  it("'today' begins at IST midnight even when UTC is still on the previous date", () => {
    const now = new Date("2026-09-24T20:00:00Z"); // 01:30 IST on the 25th
    expect(storeDaysAgo(0, now).toISOString()).toBe("2026-09-24T18:30:00.000Z");
    expect(storeDaysAgo(7, now).toISOString()).toBe("2026-09-17T18:30:00.000Z");
  });

  it("steps calendar months in IST, normalizing overflow like setMonth", () => {
    const now = new Date("2026-09-25T06:00:00Z");
    expect(storeMonthsAgo(1, now).toISOString()).toBe("2026-08-24T18:30:00.000Z");
    expect(storeMonthsAgo(3, now).toISOString()).toBe("2026-06-24T18:30:00.000Z");
    // Mar 31 - 1 month -> "Feb 31" -> Mar 3
    expect(storeDay(storeMonthsAgo(1, new Date("2026-03-31T06:00:00Z")))).toBe("2026-03-03");
  });

  it("lists every store day in a range, inclusive at both ends", () => {
    const days = storeDaysBetween(startOfStoreDay("2026-09-28"), new Date("2026-10-02T12:00:00Z"));
    expect(days).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(
      storeDaysBetween(new Date("2026-09-25T01:00:00Z"), new Date("2026-09-25T02:00:00Z")),
    ).toEqual(["2026-09-25"]);
  });
});

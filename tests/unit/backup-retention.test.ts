import { describe, expect, it } from "vitest";
import {
  MIN_BACKUPS_TO_KEEP,
  selectKeysToDelete,
  type BackupObject,
} from "../../scripts/lib/backup-retention";

const NOW = new Date("2027-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

function obj(key: string, ageDays: number): BackupObject {
  return { key, uploadedAt: daysAgo(ageDays) };
}

describe("selectKeysToDelete", () => {
  it("deletes nothing when the list is empty", () => {
    expect(selectKeysToDelete([], NOW)).toEqual([]);
  });

  it("keeps everything within the 7-day recent tier", () => {
    const objects = [obj("a", 0), obj("b", 3), obj("c", 6.9), obj("d", 7)];
    expect(selectKeysToDelete(objects, NOW)).toEqual([]);
  });

  it("in the 8-30 day tier, keeps only one backup per calendar day", () => {
    // Padding so the safety floor (MIN_BACKUPS_TO_KEEP) doesn't itself
    // interfere with isolating this tier's behaviour — see the padding
    // note on the "refuses to delete" test below for why that matters.
    const padding = [obj("pad1", 0), obj("pad2", 1), obj("pad3", 2)];
    // Two backups 12h apart, both ~10 days old, same UTC day.
    const objects = [
      ...padding,
      { key: "morning", uploadedAt: new Date("2026-12-22T00:00:00.000Z") },
      { key: "evening", uploadedAt: new Date("2026-12-22T12:00:00.000Z") },
    ];
    const deleted = selectKeysToDelete(objects, NOW);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toBe("evening"); // the later one on that day is dropped, the earlier kept
  });

  it("in the 8-30 day tier, keeps one backup on each distinct day", () => {
    const objects = [obj("day1", 10), obj("day2", 11), obj("day3", 12)];
    expect(selectKeysToDelete(objects, NOW)).toEqual([]);
  });

  it("in the 31-365 day tier, keeps only one backup per calendar month", () => {
    const padding = [obj("pad1", 0), obj("pad2", 1), obj("pad3", 2)];
    const objects = [
      ...padding,
      { key: "early-in-month", uploadedAt: new Date("2026-06-03T00:00:00.000Z") },
      { key: "late-in-month", uploadedAt: new Date("2026-06-25T00:00:00.000Z") },
    ];
    const deleted = selectKeysToDelete(objects, NOW);
    expect(deleted).toEqual(["late-in-month"]);
  });

  it("in the 31-365 day tier, keeps one backup for each distinct month", () => {
    const objects = [
      { key: "jan", uploadedAt: new Date("2026-03-01T00:00:00.000Z") },
      { key: "feb", uploadedAt: new Date("2026-04-01T00:00:00.000Z") },
      { key: "mar", uploadedAt: new Date("2026-05-01T00:00:00.000Z") },
    ];
    expect(selectKeysToDelete(objects, NOW)).toEqual([]);
  });

  it("deletes backups older than 365 days", () => {
    const padding = [obj("pad1", 0), obj("pad2", 1), obj("pad3", 2)];
    const objects = [...padding, obj("old", 366), obj("ancient", 900)];
    // Returned oldest-first, matching the function's internal sort order.
    expect(selectKeysToDelete(objects, NOW)).toEqual(["ancient", "old"]);
  });

  it("keeps a backup exactly on the 365-day boundary", () => {
    const padding = [obj("pad1", 0), obj("pad2", 1), obj("pad3", 2)];
    const objects = [...padding, obj("boundary", 365), obj("just-over", 365.1)];
    expect(selectKeysToDelete(objects, NOW)).toEqual(["just-over"]);
  });

  it("does not care about input order", () => {
    const objects = [obj("c", 6.9), obj("a", 0), obj("b", 3)];
    expect(selectKeysToDelete(objects, NOW)).toEqual([]);
  });

  it("refuses to delete anything if it would leave fewer than the safety floor", () => {
    // Two old objects, deleting both would leave 0 remaining — well under
    // MIN_BACKUPS_TO_KEEP — so nothing should be deleted at all.
    const objects = [obj("old1", 400), obj("old2", 500)];
    expect(selectKeysToDelete(objects, NOW)).toEqual([]);
    expect(MIN_BACKUPS_TO_KEEP).toBeGreaterThan(0);
  });

  it("simulates ~2 years of 12-hourly backups and keeps a bounded, sane set", () => {
    const objects: BackupObject[] = [];
    for (let halfDay = 0; halfDay < 365 * 2 * 2; halfDay++) {
      objects.push({
        key: `backup-${halfDay}`,
        uploadedAt: new Date(NOW.getTime() - halfDay * (DAY / 2)),
      });
    }

    const deleted = selectKeysToDelete(objects, NOW);
    const remaining = objects.length - deleted.length;

    // 14 (recent, every 12h for 7 days) + ~23 (1/day for 8-30 days)
    // + ~12 (1/month for 31-365 days) — generous bounds, not an exact
    // count, since month/day lengths vary.
    expect(remaining).toBeGreaterThanOrEqual(40);
    expect(remaining).toBeLessThanOrEqual(55);
    // The whole point of tiering: it must be far less than the ~1460
    // objects that 2 years of unpruned 12-hourly backups would produce.
    expect(remaining).toBeLessThan(objects.length / 10);
  });
});

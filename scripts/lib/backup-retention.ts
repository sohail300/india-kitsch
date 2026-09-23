/**
 * Pure retention-selection logic for scripts/prune-backups.ts. Kept
 * separate from any R2/filesystem I/O specifically so it can be unit
 * tested exhaustively (tests/unit/backup-retention.test.ts) before it's
 * ever wired to a real delete call — see docs/08 §16 for why that
 * separation matters for a backup system specifically.
 *
 * Tiered ("grandfather-father-son") rolling retention:
 *  - 0–7 days old:   keep every backup (14 at the 12-hourly cadence)
 *  - 8–30 days old:  keep 1 per calendar day
 *  - 31–365 days old: keep 1 per calendar month
 *  - older than 365 days: delete
 */

export interface BackupObject {
  key: string;
  uploadedAt: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_TIER_DAYS = 7;
const DAILY_TIER_DAYS = 30;
const MONTHLY_TIER_DAYS = 365;

/** A hard floor: never delete anything if fewer than this many would remain. */
export const MIN_BACKUPS_TO_KEEP = 3;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Returns the keys that should be deleted, given the full current object
 * listing and the current time. Never mutates its input, never touches
 * R2 — that's the caller's job, after looking at this result.
 */
export function selectKeysToDelete(objects: BackupObject[], now: Date): string[] {
  const sorted = [...objects].sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());

  const seenDays = new Set<string>();
  const seenMonths = new Set<string>();
  const keep = new Set<string>();

  for (const obj of sorted) {
    const ageDays = (now.getTime() - obj.uploadedAt.getTime()) / MS_PER_DAY;

    if (ageDays <= RECENT_TIER_DAYS) {
      keep.add(obj.key);
      continue;
    }

    if (ageDays <= DAILY_TIER_DAYS) {
      const key = dayKey(obj.uploadedAt);
      if (!seenDays.has(key)) {
        seenDays.add(key);
        keep.add(obj.key);
      }
      continue;
    }

    if (ageDays <= MONTHLY_TIER_DAYS) {
      const key = monthKey(obj.uploadedAt);
      if (!seenMonths.has(key)) {
        seenMonths.add(key);
        keep.add(obj.key);
      }
      continue;
    }

    // older than 365 days: not kept by any tier, falls through to delete
  }

  const toDelete = sorted.filter((obj) => !keep.has(obj.key)).map((obj) => obj.key);

  // Safety floor: if pruning would leave too few backups, something is
  // almost certainly wrong (e.g. a clock issue, a mostly-empty bucket,
  // or a bug) — abort rather than risk deleting anything.
  const wouldRemain = objects.length - toDelete.length;
  if (wouldRemain < MIN_BACKUPS_TO_KEEP) {
    return [];
  }

  return toDelete;
}

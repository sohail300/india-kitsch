import "server-only";
import { lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { webhookEvents } from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import { createR2Client, deleteObject, listObjects } from "./r2";

/**
 * The weekly sweep (docs/07 §12 step 5, docs/03 §4): two unrelated cleanup
 * jobs that share a single cron trigger because neither is worth its own
 * schedule. Both are pure "delete things nothing references anymore" —
 * idempotent, safe to run twice, safe to run more or less often than weekly.
 */

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface SweepResult {
  orphanImages: { scanned: number; deleted: number; failed: number };
  webhookEvents: { deleted: number };
}

/**
 * Deletes R2 objects under `products/` with no matching `product_images.r2_key`
 * row. `product_images` rows are hard-deleted (no soft-delete grace period
 * actually exists in the schema, despite docs/07 §12's original "purge after
 * 30 days" framing — see its own note), so anything orphaned is already
 * final; the only reason for a grace window at all is the gap between a
 * presigned PUT landing in R2 and its `commitProductImageUpload` row being
 * written a moment later — an object younger than that is left alone.
 */
async function sweepOrphanImages(
  dbHandle: DbOrTx,
  client = createR2Client(),
  /** Overridable so a test can prove deletion without waiting 24h for a
   * real R2 object to age — R2 sets `LastModified` itself at upload time,
   * there's no way to backdate it through a real PUT. */
  graceMs = ORPHAN_GRACE_MS,
  /** Overridable so a test can scope a run to its own objects only — the
   * real dev bucket accumulates genuine orphans from ordinary manual
   * testing over time, and a test forcing an aggressive (or negative)
   * grace period must not sweep those up as collateral damage. */
  prefix = "products/",
): Promise<SweepResult["orphanImages"]> {
  const [objects, rows] = await Promise.all([
    listObjects(client, prefix),
    dbHandle.query.productImages.findMany({ columns: { r2Key: true } }),
  ]);
  const knownKeys = new Set(rows.map((r) => r.r2Key));
  const cutoff = Date.now() - graceMs;

  const orphans = objects.filter(
    (obj) => !knownKeys.has(obj.key) && (obj.lastModified?.getTime() ?? 0) < cutoff,
  );

  let deleted = 0;
  let failed = 0;
  for (const orphan of orphans) {
    try {
      await deleteObject(client, orphan.key);
      deleted++;
    } catch (error) {
      failed++;
      logger.error("sweep: failed to delete orphan image", { key: orphan.key, error });
    }
  }

  return { scanned: objects.length, deleted, failed };
}

/** Deletes `webhook_events` rows older than 90 days (docs/03 §4) — the
 * idempotency/replay guard only needs to cover events Razorpay could still
 * plausibly redeliver, not forever. */
async function pruneWebhookEvents(dbHandle: DbOrTx): Promise<SweepResult["webhookEvents"]> {
  const cutoff = new Date(Date.now() - WEBHOOK_EVENT_RETENTION_MS);
  const deletedRows = await dbHandle
    .delete(webhookEvents)
    .where(lt(webhookEvents.receivedAt, cutoff))
    .returning({ id: webhookEvents.id });
  return { deleted: deletedRows.length };
}

export async function runSweep(dbHandle: DbOrTx = db): Promise<SweepResult> {
  const [orphanImages, webhookEventsResult] = await Promise.all([
    sweepOrphanImages(dbHandle),
    pruneWebhookEvents(dbHandle),
  ]);
  return { orphanImages, webhookEvents: webhookEventsResult };
}

// Re-exported for tests, which need to check each half independently
// against seeded R2 objects / webhook_events rows.
export { sweepOrphanImages, pruneWebhookEvents };

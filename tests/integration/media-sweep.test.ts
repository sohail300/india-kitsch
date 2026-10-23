/**
 * Real integration test — local/CI Postgres 16 (compose.yaml, docs/09 §20)
 * for the DB side, the real R2 dev bucket for storage (same reasoning as
 * media-uploads.test.ts: R2 has no local emulator here). Every object this
 * test creates is deleted afterward, success or failure — most are deleted
 * *by the sweep itself*, which is the thing under test.
 */
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { env } from "@/server/lib/env";
import { createId } from "@/server/lib/ids";
import { createR2Client, deleteObject } from "@/server/modules/media/r2";
import { pruneWebhookEvents, sweepOrphanImages } from "@/server/modules/media/sweep";
import { migrateTestDb } from "../setup/migrate-test-db";

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — see .env.example (run `podman compose up -d` / `docker compose up -d` first).",
    );
  }
  return url;
}

const client = postgres(requireTestDatabaseUrl(), { max: 5 });
const db = drizzle(client, { schema });
const r2 = createR2Client();

const uploadedKeys: string[] = [];
const createdCategoryIds: string[] = [];
const createdWebhookEventIds: string[] = [];

async function putTestObject(key: string): Promise<void> {
  await r2.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: "x", ContentType: "image/webp" }),
  );
}

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  for (const key of uploadedKeys) {
    await deleteObject(r2, key).catch(() => {});
  }
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  if (createdWebhookEventIds.length > 0) {
    await db
      .delete(schema.webhookEvents)
      .where(inArray(schema.webhookEvents.id, createdWebhookEventIds));
  }
  await client.end();
});

describe("sweepOrphanImages (real R2)", () => {
  it("leaves a fresh orphan alone under the real grace period, never touches a referenced key, then deletes the orphan once it's past grace", async () => {
    const prefix = `products/sweep-test-${createId()}`;
    const orphanKey = `${prefix}/orphan.webp`;
    const knownKey = `${prefix}/known.webp`;
    uploadedKeys.push(orphanKey, knownKey);
    await Promise.all([putTestObject(orphanKey), putTestObject(knownKey)]);

    // A real product_images row pointing at `knownKey` — the sweep must
    // never delete an object something still references, however old.
    const categoryId = createId();
    createdCategoryIds.push(categoryId);
    await db
      .insert(schema.categories)
      .values({ id: categoryId, name: "Sweep Test", slug: `sweep-test-cat-${categoryId}` });
    const productId = createId();
    await db.insert(schema.products).values({
      id: productId,
      slug: `sweep-test-product-${productId}`,
      name: "Sweep Test Product",
      categoryId,
      pricePaise: 100000,
      gstRateBps: 1200,
      status: "draft",
    });
    await db.insert(schema.productImages).values({
      id: createId(),
      productId,
      r2Key: knownKey,
      alt: "Known image",
      width: 10,
      height: 10,
    });

    // Scoped to this test's own prefix — the real dev bucket has genuine
    // orphans from ordinary manual testing over time, and the negative
    // grace period below must never sweep those up as collateral damage.
    // Real 24h grace: both objects were uploaded moments ago, so neither
    // qualifies yet — proves the grace period actually protects a fresh
    // orphan, not just that a referenced key is safe.
    const realGraceResult = await sweepOrphanImages(db, r2, 24 * 60 * 60 * 1000, prefix);
    expect(realGraceResult.failed).toBe(0);
    await expect(
      r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: orphanKey })),
    ).resolves.toBeDefined();

    // A deliberately negative grace pushes the cutoff into the future,
    // comfortably clearing this sandbox's clock skew against R2's own
    // server clock (confirmed directly: an object's real `LastModified`
    // can land several seconds *after* a `Date.now()` captured on this
    // machine moments later, at graceMs=0 — see docs/07 §12's existing
    // presigned-URL clock note, same root cause, different symptom) —
    // deterministically "past grace" regardless of that skew.
    const pastGraceResult = await sweepOrphanImages(db, r2, -60_000, prefix);
    expect(pastGraceResult.failed).toBe(0);
    expect(pastGraceResult.deleted).toBeGreaterThanOrEqual(1);

    // orphanKey is gone; knownKey survives regardless of grace, always.
    await expect(
      r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: orphanKey })),
    ).rejects.toThrow();
    await expect(
      r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: knownKey })),
    ).resolves.toBeDefined();
  }, 30_000);
});

describe("pruneWebhookEvents (real Postgres)", () => {
  it("deletes rows older than 90 days, keeps recent ones", async () => {
    const oldId = `sweep-test-old-${createId()}`;
    const recentId = `sweep-test-recent-${createId()}`;
    createdWebhookEventIds.push(oldId, recentId);

    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.insert(schema.webhookEvents).values([
      { id: oldId, type: "payment.captured", receivedAt: ninetyOneDaysAgo },
      { id: recentId, type: "payment.captured", receivedAt: oneDayAgo },
    ]);

    const result = await pruneWebhookEvents(db);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await db.query.webhookEvents.findMany({
      where: inArray(schema.webhookEvents.id, [oldId, recentId]),
    });
    expect(remaining.map((r) => r.id)).toEqual([recentId]);
  });
});

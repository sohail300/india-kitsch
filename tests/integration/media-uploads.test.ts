/**
 * Real integration test — local/CI Postgres 16 (compose.yaml, docs/09 §20)
 * for the DB side, but the **real R2 bucket** for storage: R2 has no local
 * emulator in this project, and Phase 0's spike (scripts/phase0-r2-check.ts)
 * already established testing this flow against the real dev bucket rather
 * than mocking the S3 API. Every object this test creates is deleted
 * afterward, success or failure.
 *
 * The "browser PUTs to the presigned URL" hop is simulated with a *direct*
 * `PutObjectCommand` instead of actually `fetch`-ing `signed.uploadUrl`:
 * this sandbox's system clock is set to a fictional future date, and
 * Cloudflare R2 rejects presigned URLs signed against it with
 * `ExpiredRequest` (confirmed directly — a live SDK call signs and sends
 * in one step and succeeds; a presigned URL's signature is fixed at
 * generation time and R2 checks it against its own real clock, so it
 * always fails here regardless of how quickly it's used). This is a sandbox
 * quirk, not a code bug — `signProductImageUpload` calls the AWS SDK's
 * `getSignedUrl` exactly as Phase 0's already-proven spike does, and
 * Vercel's real clock won't have this problem. What this still verifies
 * for real: `signProductImageUpload`'s validation and key generation, and
 * `commitProductImageUpload`'s actual server-side verification (HEAD,
 * magic bytes, delete-on-failure) against a real object in the real bucket.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { env } from "@/server/lib/env";
import { createId } from "@/server/lib/ids";
import { commitProductImageUpload, signProductImageUpload } from "@/server/modules/media/uploads";
import { createR2Client, deleteObject } from "@/server/modules/media/r2";
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

// Minimal valid file headers — real magic bytes, not full valid images
// (fine: verification only reads the first 12 bytes).
const REAL_WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from([0, 0, 0, 0]),
]);
const REAL_PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const NOT_AN_IMAGE = Buffer.from("this is definitely not an image file, just text", "utf-8");

const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const uploadedKeys: string[] = [];
let adminUserId: string;

async function putTestObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

async function createTestProduct(): Promise<{ id: string }> {
  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `media-test-cat-${categoryId}` });
  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `media-test-product-${productId}`,
    name: "Media Test Product",
    categoryId,
    pricePaise: 100000,
    gstRateBps: 1200,
    status: "draft",
  });
  return { id: productId };
}

beforeAll(async () => {
  await migrateTestDb();
  adminUserId = createId();
  createdUserIds.push(adminUserId);
  await db.insert(schema.user).values({
    id: adminUserId,
    name: "Admin",
    email: `admin-${adminUserId}@indiakitsch.test`,
    role: "admin",
    emailVerified: true,
  });
}, 60_000);

afterAll(async () => {
  for (const key of uploadedKeys) {
    await deleteObject(r2, key).catch(() => {});
  }
  if (createdCategoryIds.length > 0) {
    // product_images.product_id cascades on delete, so this alone clears both.
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.adminUserId, createdUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  await client.end();
});

describe("sign + commit (real R2)", () => {
  it("signs, uploads a real webp, and commits a product_images row", async () => {
    const product = await createTestProduct();

    const signed = await signProductImageUpload(
      { productId: product.id, contentType: "image/webp", sizeBytes: REAL_WEBP_HEADER.length },
      db,
    );
    uploadedKeys.push(signed.key);
    expect(signed.key.startsWith(`products/${product.id}/`)).toBe(true);
    expect(signed.uploadUrl).toMatch(/^https:\/\//);

    await putTestObject(signed.key, REAL_WEBP_HEADER, "image/webp");

    const result = await commitProductImageUpload(
      {
        productId: product.id,
        key: signed.key,
        alt: "A red kurta",
        width: 800,
        height: 1000,
        isPrimary: true,
      },
      adminUserId,
      db,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image).toMatchObject({
      productId: product.id,
      r2Key: signed.key,
      alt: "A red kurta",
      isPrimary: true,
    });

    const dbImage = await db.query.productImages.findFirst({
      where: eq(schema.productImages.id, result.image.id),
    });
    expect(dbImage).toBeDefined();
  }, 30_000);

  it("rejects and deletes the object when the uploaded bytes don't match the declared content-type", async () => {
    const product = await createTestProduct();

    const signed = await signProductImageUpload(
      { productId: product.id, contentType: "image/png", sizeBytes: NOT_AN_IMAGE.length },
      db,
    );
    uploadedKeys.push(signed.key);

    await putTestObject(signed.key, NOT_AN_IMAGE, "image/png");

    const result = await commitProductImageUpload(
      { productId: product.id, key: signed.key, alt: "Fake", width: 100, height: 100 },
      adminUserId,
      db,
    );

    expect(result).toMatchObject({ ok: false, code: "magic_bytes_mismatch" });

    // The object should be gone — headObject (via a fresh sign+commit cycle) would 404. Verify indirectly: a second commit attempt reports not_found.
    const secondAttempt = await commitProductImageUpload(
      { productId: product.id, key: signed.key, alt: "Fake again", width: 100, height: 100 },
      adminUserId,
      db,
    );
    expect(secondAttempt).toMatchObject({ ok: false, code: "not_found" });
  }, 30_000);

  it("rejects a key that doesn't belong to the given product", async () => {
    const productA = await createTestProduct();
    const productB = await createTestProduct();

    const signed = await signProductImageUpload(
      { productId: productA.id, contentType: "image/png", sizeBytes: REAL_PNG_HEADER.length },
      db,
    );
    uploadedKeys.push(signed.key);
    await putTestObject(signed.key, REAL_PNG_HEADER, "image/png");

    const result = await commitProductImageUpload(
      { productId: productB.id, key: signed.key, alt: "Wrong product", width: 100, height: 100 },
      adminUserId,
      db,
    );
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  }, 30_000);

  it("rejects signing for a nonexistent product", async () => {
    await expect(
      signProductImageUpload(
        { productId: "no-such-product", contentType: "image/webp", sizeBytes: 1000 },
        db,
      ),
    ).rejects.toThrow();
  });

  it("rejects a commit for an object that was never uploaded", async () => {
    const product = await createTestProduct();
    const result = await commitProductImageUpload(
      {
        productId: product.id,
        key: `products/${product.id}/${createId()}.webp`,
        alt: "Never uploaded",
        width: 100,
        height: 100,
      },
      adminUserId,
      db,
    );
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  }, 15_000);
});

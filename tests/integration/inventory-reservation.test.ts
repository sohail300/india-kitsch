/**
 * Real integration test — runs against a local/CI Postgres 16 (compose.yaml
 * + tests/setup/migrate-test-db.ts), never Supabase (docs/09 §20: "Never
 * against the Supabase projects"). Proves the conditional-UPDATE stock
 * reservation pattern (docs/03 §11) under genuine concurrent transactions,
 * not simulated ones — real overlapping `db.transaction()` calls racing
 * against the same rows.
 *
 * `server-only` (on inventory/service.ts, inventory/queries.ts) resolves
 * fine here — vitest.config.ts aliases it to a no-op stub for tests.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import { OutOfStockError } from "@/server/lib/errors";
import { releaseStock, reserveStock } from "@/server/modules/inventory/service";
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

const client = postgres(requireTestDatabaseUrl(), { max: 10 });
const db = drizzle(client, { schema });

const createdCategoryIds: string[] = [];

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  // products.categoryId is onDelete: "restrict", so products (which cascade
  // to variants/inventory/stock_movements) must go first, categories after.
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  await client.end();
});

async function createVariantWithStock(onHand: number): Promise<string> {
  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `test-cat-${categoryId}` });

  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `test-product-${productId}`,
    name: "Test product",
    categoryId,
    pricePaise: 100000,
    gstRateBps: 1200,
    status: "active",
  });

  const variantId = createId();
  await db.insert(schema.productVariants).values({
    id: variantId,
    productId,
    sku: `SKU-${variantId}`,
    size: "M",
    color: "Red",
  });
  await db.insert(schema.inventory).values({ variantId, onHand, reserved: 0 });

  return variantId;
}

async function getInventoryRow(variantId: string) {
  const [row] = await db
    .select()
    .from(schema.inventory)
    .where(eq(schema.inventory.variantId, variantId));
  return row;
}

describe("reserveStock concurrency", () => {
  it("exactly onHand reservations succeed when more shoppers race for the last units", async () => {
    const onHand = 3;
    const attempts = 10;
    const variantId = await createVariantWithStock(onHand);

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        db.transaction((tx) => reserveStock(tx, [{ variantId, quantity: 1 }])),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(onHand);
    expect(failed).toHaveLength(attempts - onHand);
    for (const failure of failed) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(OutOfStockError);
    }

    const row = await getInventoryRow(variantId);
    expect(row?.reserved).toBe(onHand);
    expect(row!.reserved).toBeLessThanOrEqual(row!.onHand);
  }, 20_000);

  it("overlapping multi-line carts in opposite pick order don't deadlock", async () => {
    const variantA = await createVariantWithStock(5);
    const variantB = await createVariantWithStock(5);

    // reserveStock sorts ascending by variantId internally regardless of
    // the order callers pass lines in — that's what prevents the deadlock.
    const cartAB = [
      { variantId: variantB, quantity: 1 },
      { variantId: variantA, quantity: 1 },
    ];
    const cartBA = [
      { variantId: variantA, quantity: 1 },
      { variantId: variantB, quantity: 1 },
    ];

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        db.transaction((tx) => reserveStock(tx, i % 2 === 0 ? cartAB : cartBA)),
      ),
    );

    expect(results).toHaveLength(5);
    const rowA = await getInventoryRow(variantA);
    const rowB = await getInventoryRow(variantB);
    expect(rowA?.reserved).toBe(5);
    expect(rowB?.reserved).toBe(5);
  }, 20_000);

  it("rolls back an earlier successful line when a later line in the same call is out of stock", async () => {
    const variantA = await createVariantWithStock(5);
    const variantB = await createVariantWithStock(0);
    // ULIDs are creation-ordered, so variantA sorts before variantB — the
    // first line reserves, the second fails, and the whole call must undo it.
    expect(variantA < variantB).toBe(true);

    await expect(
      db.transaction((tx) =>
        reserveStock(tx, [
          { variantId: variantA, quantity: 1 },
          { variantId: variantB, quantity: 1 },
        ]),
      ),
    ).rejects.toBeInstanceOf(OutOfStockError);

    const rowA = await getInventoryRow(variantA);
    expect(rowA?.reserved).toBe(0);
  });

  it("rejects a non-positive quantity without touching the row", async () => {
    const variantId = await createVariantWithStock(5);
    await expect(
      db.transaction((tx) => reserveStock(tx, [{ variantId, quantity: 0 }])),
    ).rejects.toThrow(/positive integer/);

    const row = await getInventoryRow(variantId);
    expect(row?.reserved).toBe(0);
  });
});

describe("releaseStock", () => {
  it("decrements reserved and records a release movement", async () => {
    const variantId = await createVariantWithStock(5);
    await db.transaction((tx) => reserveStock(tx, [{ variantId, quantity: 3 }]));
    await db.transaction((tx) => releaseStock(tx, [{ variantId, quantity: 3 }]));

    const row = await getInventoryRow(variantId);
    expect(row?.reserved).toBe(0);

    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.variantId, variantId));
    expect(movements.map((m) => m.reason).sort()).toEqual(["release", "reserve"]);
  });

  it("rejects releasing more than is currently reserved", async () => {
    const variantId = await createVariantWithStock(5);
    await db.transaction((tx) => reserveStock(tx, [{ variantId, quantity: 1 }]));

    await expect(
      db.transaction((tx) => releaseStock(tx, [{ variantId, quantity: 2 }])),
    ).rejects.toThrow(/cannot release/);

    const row = await getInventoryRow(variantId);
    expect(row?.reserved).toBe(1); // unchanged
  });
});

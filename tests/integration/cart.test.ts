/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Seeds real catalog/inventory rows and exercises
 * quoteCart's actual clamping/flagging/pricing logic against them.
 */
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import { CART_LINE_QUANTITY_CAP, quoteCart } from "@/server/modules/cart/quote";
import { migrateTestDb } from "../setup/migrate-test-db";

const createdCouponIds: string[] = [];

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

let categoryId: string;
let inStockVariantId: string; // 5 available, active product
let highStockVariantId: string; // 20 available — enough to isolate the per-line cap from stock limits
let lowStockVariantId: string; // 2 available
let outOfStockVariantId: string; // 0 available
let archivedVariantId: string; // isActive false
let draftProductVariantId: string; // product.status draft

beforeAll(async () => {
  await migrateTestDb();

  categoryId = createId();
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `cart-test-cat-${categoryId}` });

  const activeProductId = createId();
  await db.insert(schema.products).values({
    id: activeProductId,
    slug: `cart-test-product-${activeProductId}`,
    name: "Cart Test Product",
    categoryId,
    pricePaise: 100000,
    gstRateBps: 1200,
    status: "active",
  });

  inStockVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: inStockVariantId,
    productId: activeProductId,
    sku: `SKU-${inStockVariantId}`,
    size: "M",
    color: "Red",
  });
  await db.insert(schema.inventory).values({ variantId: inStockVariantId, onHand: 5, reserved: 0 });

  highStockVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: highStockVariantId,
    productId: activeProductId,
    sku: `SKU-${highStockVariantId}`,
    size: "M",
    color: "Green",
  });
  await db
    .insert(schema.inventory)
    .values({ variantId: highStockVariantId, onHand: 20, reserved: 0 });

  lowStockVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: lowStockVariantId,
    productId: activeProductId,
    sku: `SKU-${lowStockVariantId}`,
    size: "L",
    color: "Red",
  });
  await db
    .insert(schema.inventory)
    .values({ variantId: lowStockVariantId, onHand: 2, reserved: 0 });

  outOfStockVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: outOfStockVariantId,
    productId: activeProductId,
    sku: `SKU-${outOfStockVariantId}`,
    size: "S",
    color: "Red",
  });
  await db
    .insert(schema.inventory)
    .values({ variantId: outOfStockVariantId, onHand: 0, reserved: 0 });

  archivedVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: archivedVariantId,
    productId: activeProductId,
    sku: `SKU-${archivedVariantId}`,
    size: "XL",
    color: "Red",
    isActive: false,
  });
  await db
    .insert(schema.inventory)
    .values({ variantId: archivedVariantId, onHand: 5, reserved: 0 });

  const draftProductId = createId();
  await db.insert(schema.products).values({
    id: draftProductId,
    slug: `cart-test-draft-${draftProductId}`,
    name: "Draft Product",
    categoryId,
    pricePaise: 50000,
    gstRateBps: 1200,
    status: "draft",
  });
  draftProductVariantId = createId();
  await db.insert(schema.productVariants).values({
    id: draftProductVariantId,
    productId: draftProductId,
    sku: `SKU-${draftProductVariantId}`,
    size: "M",
    color: "Blue",
  });
  await db
    .insert(schema.inventory)
    .values({ variantId: draftProductVariantId, onHand: 10, reserved: 0 });
}, 60_000);

afterAll(async () => {
  await db.delete(schema.products).where(inArray(schema.products.categoryId, [categoryId]));
  await db.delete(schema.categories).where(inArray(schema.categories.id, [categoryId]));
  if (createdCouponIds.length > 0) {
    await db.delete(schema.coupons).where(inArray(schema.coupons.id, createdCouponIds));
  }
  await client.end();
});

describe("quoteCart", () => {
  it("returns a zeroed result for an empty cart", async () => {
    const result = await quoteCart([], {}, db);
    expect(result).toEqual({
      lines: [],
      removedLines: [],
      subtotalPaise: 0,
      discountPaise: 0,
      shippingPaise: 0,
      taxIncludedPaise: 0,
      totalPaise: 0,
      coupon: null,
    });
  });

  it("prices an ordinary in-stock line", async () => {
    const result = await quoteCart([{ variantId: inStockVariantId, quantity: 2 }], {}, db);
    const [line] = result.lines;
    expect(line?.status).toBe("ok");
    expect(line?.includedInTotals).toBe(true);
    expect(line?.quantity).toBe(2);
    expect(result.subtotalPaise).toBe(200000);
  });

  it("merges duplicate lines for the same variant", async () => {
    const result = await quoteCart(
      [
        { variantId: inStockVariantId, quantity: 1 },
        { variantId: inStockVariantId, quantity: 1 },
      ],
      {},
      db,
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.quantity).toBe(2);
  });

  it("clamps a requested quantity above the per-line cap", async () => {
    const result = await quoteCart(
      [{ variantId: highStockVariantId, quantity: CART_LINE_QUANTITY_CAP + 5 }],
      {},
      db,
    );
    const [line] = result.lines;
    expect(line?.status).toBe("quantity_clamped");
    expect(line?.quantity).toBe(CART_LINE_QUANTITY_CAP);
    expect(line?.requestedQuantity).toBe(CART_LINE_QUANTITY_CAP + 5);
  });

  it("reduces a requested quantity above what's actually available", async () => {
    const result = await quoteCart([{ variantId: lowStockVariantId, quantity: 5 }], {}, db);
    const [line] = result.lines;
    expect(line?.status).toBe("quantity_reduced_for_stock");
    expect(line?.quantity).toBe(2);
    expect(line?.includedInTotals).toBe(true);
  });

  it("flags an out-of-stock variant and excludes it from totals", async () => {
    const result = await quoteCart([{ variantId: outOfStockVariantId, quantity: 1 }], {}, db);
    const [line] = result.lines;
    expect(line?.status).toBe("unavailable");
    expect(line?.quantity).toBe(0);
    expect(line?.includedInTotals).toBe(false);
    expect(result.subtotalPaise).toBe(0);
  });

  it("flags an archived variant as unpurchasable", async () => {
    const result = await quoteCart([{ variantId: archivedVariantId, quantity: 1 }], {}, db);
    expect(result.lines[0]?.status).toBe("unpurchasable");
    expect(result.lines[0]?.includedInTotals).toBe(false);
  });

  it("flags a variant of a non-active (draft) product as unpurchasable", async () => {
    const result = await quoteCart([{ variantId: draftProductVariantId, quantity: 1 }], {}, db);
    expect(result.lines[0]?.status).toBe("unpurchasable");
  });

  it("moves an unresolvable variant id to removedLines instead of throwing", async () => {
    const result = await quoteCart([{ variantId: "does-not-exist", quantity: 1 }], {}, db);
    expect(result.lines).toHaveLength(0);
    expect(result.removedLines).toEqual([{ variantId: "does-not-exist", reason: "not_found" }]);
  });

  it("mixes a purchasable and an unpurchasable line, pricing only the purchasable one", async () => {
    const result = await quoteCart(
      [
        { variantId: inStockVariantId, quantity: 1 },
        { variantId: outOfStockVariantId, quantity: 1 },
      ],
      {},
      db,
    );
    expect(result.lines).toHaveLength(2);
    expect(result.subtotalPaise).toBe(100000); // only the in-stock line
  });

  it("applies a valid coupon to the total and reports it back on the result", async () => {
    const couponId = createId();
    createdCouponIds.push(couponId);
    const code = `CARTTEST${couponId}`.slice(0, 40).toUpperCase();
    await db.insert(schema.coupons).values({ id: couponId, code, type: "percent", valueBps: 1000 }); // 10%

    const result = await quoteCart(
      [{ variantId: inStockVariantId, quantity: 1 }],
      { couponCode: code },
      db,
    );
    expect(result.coupon).toMatchObject({ ok: true, code, discountPaise: 10000 });
    expect(result.discountPaise).toBe(10000);
    expect(result.subtotalPaise).toBe(100000);
  });

  it("passes through an invalid coupon result without throwing or discounting", async () => {
    const result = await quoteCart(
      [{ variantId: inStockVariantId, quantity: 1 }],
      { couponCode: "NO-SUCH-COUPON" },
      db,
    );
    expect(result.coupon).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(result.discountPaise).toBe(0);
  });
});

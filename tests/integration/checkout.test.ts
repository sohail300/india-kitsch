/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Razorpay's HTTP layer is mocked (docs/09 §20:
 * "Razorpay: HTTP layer mocked with recorded fixtures in CI") via
 * RazorpayClient's injectable `fetchImpl` — everything else (stock
 * reservation, coupon redemption, the order transaction, idempotency, the
 * expired-reservation lazy release) runs against the real database.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import { createOrder } from "@/server/modules/checkout/createOrder";
import { RazorpayClient } from "@/server/modules/payments/razorpay";
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

function createMockRazorpay(): { razorpay: RazorpayClient; callCount: () => number } {
  let calls = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls++;
    const urlStr = String(url);
    if (urlStr.endsWith("/orders") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        amount: number;
        currency: string;
        receipt: string;
      };
      return new Response(
        JSON.stringify({
          id: `order_mock_${createId()}`,
          amount: body.amount,
          currency: body.currency,
          receipt: body.receipt,
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: { description: "unmocked endpoint" } }), {
      status: 404,
    });
  }) as typeof fetch;

  return {
    razorpay: new RazorpayClient({ keyId: "test_key_id", keySecret: "test_key_secret", fetchImpl }),
    callCount: () => calls,
  };
}

const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const createdOrderUserIds: string[] = [];

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  if (createdOrderUserIds.length > 0) {
    const userOrders = await db.query.orders.findMany({
      where: inArray(schema.orders.userId, createdOrderUserIds),
    });
    const orderIds = userOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds));
      await db.delete(schema.payments).where(inArray(schema.payments.orderId, orderIds));
      await db
        .delete(schema.couponRedemptions)
        .where(inArray(schema.couponRedemptions.orderId, orderIds));
      await db.delete(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.addresses).where(inArray(schema.addresses.userId, createdUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  await client.end();
});

async function createTestUser(): Promise<string> {
  const id = createId();
  createdUserIds.push(id);
  createdOrderUserIds.push(id);
  await db.insert(schema.user).values({
    id,
    name: "Checkout Test",
    email: `checkout-${id}@indiakitsch.test`,
    emailVerified: true,
  });
  return id;
}

async function createTestAddress(userId: string): Promise<string> {
  const id = createId();
  await db.insert(schema.addresses).values({
    id,
    userId,
    fullName: "Checkout Test",
    phone: "9999999999",
    line1: "1 Test Street",
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  });
  return id;
}

async function createTestVariant(
  onHand: number,
): Promise<{ variantId: string; categoryId: string }> {
  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `checkout-test-cat-${categoryId}` });

  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `checkout-test-product-${productId}`,
    name: "Checkout Test Product",
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

  return { variantId, categoryId };
}

async function context(userId: string) {
  return {
    userId,
    customerName: "Checkout Test",
    customerEmail: `checkout-${userId}@indiakitsch.test`,
  };
}

describe("createOrder", () => {
  it("creates a real order: reserves stock, creates the Razorpay order, and inserts all the right rows", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(5);
    const { razorpay, callCount } = createMockRazorpay();

    const result = await createOrder(
      { lines: [{ variantId, quantity: 2 }], addressId, idempotencyKey: createId() },
      await context(userId),
      db,
      razorpay,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amountPaise).toBe(209900); // 200000 subtotal + 9900 shipping (below the placeholder free threshold)
    expect(callCount()).toBe(1);

    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, result.orderId) });
    expect(order?.status).toBe("pending_payment");
    expect(order?.razorpayOrderId).toBe(result.razorpayOrderId);
    expect(order?.expiresAt).toBeTruthy();

    const items = await db.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, result.orderId),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.reserved).toBe(2);

    const events = await db.query.orderEvents.findMany({
      where: eq(schema.orderEvents.orderId, result.orderId),
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: null, toStatus: "pending_payment" });

    const paymentRows = await db.query.payments.findMany({
      where: eq(schema.payments.orderId, result.orderId),
    });
    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0]).toMatchObject({
      status: "created",
      razorpayOrderId: result.razorpayOrderId,
    });
  });

  it("is idempotent: a repeat call with the same key returns the same order without a second Razorpay call", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(5);
    const { razorpay, callCount } = createMockRazorpay();
    const idempotencyKey = createId();

    const first = await createOrder(
      { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey },
      await context(userId),
      db,
      razorpay,
    );
    const second = await createOrder(
      { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey },
      await context(userId),
      db,
      razorpay,
    );

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(callCount()).toBe(1); // no second Razorpay order created
  });

  it("returns address_not_found for another user's address", async () => {
    const userId = await createTestUser();
    const otherUserId = await createTestUser();
    const otherUsersAddressId = await createTestAddress(otherUserId);
    const { variantId } = await createTestVariant(5);
    const { razorpay, callCount } = createMockRazorpay();

    const result = await createOrder(
      {
        lines: [{ variantId, quantity: 1 }],
        addressId: otherUsersAddressId,
        idempotencyKey: createId(),
      },
      await context(userId),
      db,
      razorpay,
    );

    expect(result).toMatchObject({ ok: false, code: "address_not_found" });
    expect(callCount()).toBe(0); // never even called Razorpay
  });

  it("returns cart_changed (not out_of_stock) when the requested quantity exceeds what's available, and reserves nothing", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(1);
    const { razorpay, callCount } = createMockRazorpay();

    const result = await createOrder(
      { lines: [{ variantId, quantity: 5 }], addressId, idempotencyKey: createId() },
      await context(userId),
      db,
      razorpay,
    );

    expect(result).toMatchObject({ ok: false, code: "cart_changed" });
    expect(callCount()).toBe(0);

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.reserved).toBe(0);
  });

  it("returns price_changed when expectedTotalPaise doesn't match the freshly computed total", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(5);
    const { razorpay, callCount } = createMockRazorpay();

    const result = await createOrder(
      {
        lines: [{ variantId, quantity: 1 }],
        addressId,
        idempotencyKey: createId(),
        expectedTotalPaise: 1,
      },
      await context(userId),
      db,
      razorpay,
    );

    expect(result).toMatchObject({ ok: false, code: "price_changed" });
    expect(callCount()).toBe(0);
  });

  it("returns coupon_invalid for an unknown coupon code and creates nothing", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(5);
    const { razorpay, callCount } = createMockRazorpay();

    const result = await createOrder(
      {
        lines: [{ variantId, quantity: 1 }],
        addressId,
        idempotencyKey: createId(),
        couponCode: "NO-SUCH-CODE",
      },
      await context(userId),
      db,
      razorpay,
    );

    expect(result).toMatchObject({ ok: false, code: "coupon_invalid" });
    expect(callCount()).toBe(0);
  });

  it("applies a valid coupon: discount reflected in the Razorpay amount and a redemption row is written", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(5);
    const { razorpay } = createMockRazorpay();

    const couponId = createId();
    const code = `CHK${couponId}`.slice(0, 40).toUpperCase();
    await db.insert(schema.coupons).values({ id: couponId, code, type: "percent", valueBps: 1000 });

    const result = await createOrder(
      {
        lines: [{ variantId, quantity: 1 }],
        addressId,
        idempotencyKey: createId(),
        couponCode: code,
      },
      await context(userId),
      db,
      razorpay,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // subtotal 100000, 10% discount -> 90000 net, + 9900 shipping = 99900
    expect(result.amountPaise).toBe(99900);

    const redemptions = await db
      .select()
      .from(schema.couponRedemptions)
      .where(eq(schema.couponRedemptions.couponId, couponId));
    expect(redemptions).toHaveLength(1);

    await db
      .delete(schema.couponRedemptions)
      .where(eq(schema.couponRedemptions.couponId, couponId));
    await db.delete(schema.coupons).where(eq(schema.coupons.id, couponId));
  });

  it("exactly one of two concurrent createOrder calls for the last unit succeeds — the loser gets out_of_stock", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(1);
    const mockA = createMockRazorpay();
    const mockB = createMockRazorpay();

    const [resultA, resultB] = await Promise.all([
      createOrder(
        { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey: createId() },
        await context(userId),
        db,
        mockA.razorpay,
      ),
      createOrder(
        { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey: createId() },
        await context(userId),
        db,
        mockB.razorpay,
      ),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ ok: false, code: "out_of_stock" });

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.reserved).toBe(1);
  });

  it("lazily releases an already-expired pending order's reservation before reserving for the new one", async () => {
    const userId = await createTestUser();
    const addressId = await createTestAddress(userId);
    const { variantId } = await createTestVariant(1);
    const { razorpay: firstRazorpay } = createMockRazorpay();

    const expiredResult = await createOrder(
      { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey: createId() },
      await context(userId),
      db,
      firstRazorpay,
    );
    expect(expiredResult.ok).toBe(true);
    if (!expiredResult.ok) return;

    // Force it into the past, simulating the 5-minute hold having expired
    // before the reconciler's next 10-minute sweep gets to it.
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, expiredResult.orderId));

    const { razorpay: secondRazorpay } = createMockRazorpay();
    const secondResult = await createOrder(
      { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey: createId() },
      await context(userId),
      db,
      secondRazorpay,
    );

    expect(secondResult.ok).toBe(true);

    const expiredOrder = await db.query.orders.findFirst({
      where: eq(schema.orders.id, expiredResult.orderId),
    });
    expect(expiredOrder?.status).toBe("cancelled");
    expect(expiredOrder?.cancelReason).toBe("expired");

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.reserved).toBe(1); // only the second order's reservation remains
  });
});

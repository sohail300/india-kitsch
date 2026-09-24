/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Razorpay's HTTP layer is mocked for refunds;
 * everything else runs against a real paid order built via the
 * already-verified createOrder + markOrderPaid.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import type { EmailSender } from "@/server/lib/email";
import { createId } from "@/server/lib/ids";
import { createOrder } from "@/server/modules/checkout/createOrder";
import {
  cancelPaidOrder,
  markOrderDelivered,
  markOrderProcessing,
  markOrderShipped,
  refundOrder,
  setOrderNote,
} from "@/server/modules/orders/admin";
import { markOrderPaid } from "@/server/modules/orders/service";
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

// Every order function that might send a transactional email takes an
// injectable EmailSender (same DI pattern as razorpay); without this,
// these tests would silently hit the real Resend API on every run
// (RESEND_API_KEY is a real key here).
const mockEmailSender: EmailSender = { send: async () => {} };

function createMockRazorpay() {
  let refundCounter = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
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
        { status: 200 },
      );
    }
    const refundMatch = /\/payments\/([^/]+)\/refund$/.exec(urlStr);
    if (refundMatch && init?.method === "POST") {
      refundCounter++;
      const body = JSON.parse(String(init.body)) as { amount?: number };
      return new Response(
        JSON.stringify({
          id: `rfnd_mock_${refundCounter}_${createId()}`,
          payment_id: refundMatch[1],
          amount: body.amount ?? 0,
          status: "processed",
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: { description: "unmocked endpoint" } }), {
      status: 404,
    });
  }) as typeof fetch;

  return new RazorpayClient({ keyId: "test_key_id", keySecret: "test_key_secret", fetchImpl });
}

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function createAdminUser(): Promise<string> {
  const id = createId();
  createdUserIds.push(id);
  await db.insert(schema.user).values({
    id,
    name: "Admin",
    email: `admin-${id}@indiakitsch.test`,
    role: "admin",
    emailVerified: true,
  });
  return id;
}

let adminUserId: string;

beforeAll(async () => {
  await migrateTestDb();
  adminUserId = await createAdminUser();
}, 60_000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const userOrders = await db.query.orders.findMany({
      where: inArray(schema.orders.userId, createdUserIds),
    });
    const orderIds = userOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      await db.delete(schema.refunds).where(inArray(schema.refunds.orderId, orderIds));
      await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds));
      await db.delete(schema.payments).where(inArray(schema.payments.orderId, orderIds));
      await db.delete(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.adminUserId, [adminUserId]));
    await db.delete(schema.addresses).where(inArray(schema.addresses.userId, createdUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  await client.end();
});

async function createPaidOrder(onHand = 5, quantity = 1) {
  const userId = createId();
  createdUserIds.push(userId);
  await db.insert(schema.user).values({
    id: userId,
    name: "Order Admin Test",
    email: `orders-admin-${userId}@indiakitsch.test`,
    emailVerified: true,
  });

  const addressId = createId();
  await db.insert(schema.addresses).values({
    id: addressId,
    userId,
    fullName: "Order Admin Test",
    phone: "9999999999",
    line1: "1 Test Street",
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  });

  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `orders-admin-cat-${categoryId}` });
  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `orders-admin-product-${productId}`,
    name: "Orders Admin Test Product",
    categoryId,
    pricePaise: 100000,
    gstRateBps: 1200,
    status: "active",
  });
  const variantId = createId();
  await db
    .insert(schema.productVariants)
    .values({ id: variantId, productId, sku: `SKU-${variantId}`, size: "M", color: "Red" });
  await db.insert(schema.inventory).values({ variantId, onHand, reserved: 0 });

  const razorpay = createMockRazorpay();
  const created = await createOrder(
    { lines: [{ variantId, quantity }], addressId, idempotencyKey: createId() },
    {
      userId,
      customerName: "Order Admin Test",
      customerEmail: `orders-admin-${userId}@indiakitsch.test`,
    },
    db,
    razorpay,
  );
  if (!created.ok) throw new Error(`setup failed: ${JSON.stringify(created)}`);

  await markOrderPaid(
    { orderId: created.orderId, razorpayPaymentId: `pay_${createId()}`, actor: "customer" },
    db,

    mockEmailSender,
  );

  return { orderId: created.orderId, variantId, razorpay };
}

describe("order lifecycle transitions", () => {
  it("walks paid -> processing -> shipped -> delivered", async () => {
    const { orderId } = await createPaidOrder();

    const { result: processing } = await markOrderProcessing(orderId, adminUserId, db);
    expect(processing.status).toBe("processing");

    const { result: shipped } = await markOrderShipped(
      {
        orderId,
        courier: "Delhivery",
        trackingNumber: "TRK123",
        trackingUrl: "https://track.example/TRK123",
      },
      adminUserId,
      db,

      mockEmailSender,
    );
    expect(shipped).toMatchObject({
      status: "shipped",
      courier: "Delhivery",
      trackingNumber: "TRK123",
    });

    const { result: delivered } = await markOrderDelivered(orderId, adminUserId, db);
    expect(delivered.status).toBe("delivered");
  });

  it("rejects shipping without a tracking number", async () => {
    const { orderId } = await createPaidOrder();
    await markOrderProcessing(orderId, adminUserId, db);
    await expect(
      markOrderShipped(
        { orderId, courier: "Delhivery", trackingNumber: "" },
        adminUserId,
        db,
        mockEmailSender,
      ),
    ).rejects.toThrow();
  });

  it("rejects an illegal transition (paid straight to delivered)", async () => {
    const { orderId } = await createPaidOrder();
    await expect(markOrderDelivered(orderId, adminUserId, db)).rejects.toThrow();
  });

  it("sets and overwrites the admin note, auditing the change", async () => {
    const { orderId } = await createPaidOrder();
    await setOrderNote(orderId, "Called customer to confirm address", adminUserId, db);
    const { result } = await setOrderNote(orderId, "Address confirmed", adminUserId, db);
    expect(result.adminNote).toBe("Address confirmed");

    const audits = await db.query.auditLog.findMany({
      where: eq(schema.auditLog.entityId, orderId),
    });
    expect(audits.filter((a) => a.action === "order.setNote")).toHaveLength(2);
  });
});

describe("refundOrder", () => {
  it("records a partial refund without changing order status", async () => {
    const { orderId, razorpay } = await createPaidOrder();
    const { result } = await refundOrder(
      { orderId, amountPaise: 50000, reason: "goodwill" },
      adminUserId,
      db,
      razorpay,

      mockEmailSender,
    );

    expect(result.order.status).toBe("paid");
    expect(result.order.refundedPaise).toBe(50000);
  });

  it("transitions to refunded once the running total reaches the order total", async () => {
    const { orderId, razorpay } = await createPaidOrder();
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });

    const { result } = await refundOrder(
      { orderId, reason: "full refund" },
      adminUserId,
      db,
      razorpay,

      mockEmailSender,
    );

    expect(result.order.status).toBe("refunded");
    expect(result.order.refundedPaise).toBe(order!.totalPaise);
  });

  it("rejects a refund amount exceeding what's left refundable", async () => {
    const { orderId, razorpay } = await createPaidOrder();
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    await expect(
      refundOrder(
        { orderId, amountPaise: order!.totalPaise + 1, reason: "x" },
        adminUserId,
        db,
        razorpay,

        mockEmailSender,
      ),
    ).rejects.toThrow();
  });

  it("rejects refunding an order that was never paid", async () => {
    const userId = createId();
    createdUserIds.push(userId);
    await db
      .insert(schema.user)
      .values({ id: userId, name: "X", email: `x-${userId}@indiakitsch.test` });
    const addressId = createId();
    await db.insert(schema.addresses).values({
      id: addressId,
      userId,
      fullName: "X",
      phone: "9999999999",
      line1: "1",
      city: "Mumbai",
      state: "MH",
      pincode: "400001",
    });
    const categoryId = createId();
    createdCategoryIds.push(categoryId);
    await db
      .insert(schema.categories)
      .values({ id: categoryId, name: "Test", slug: `orders-admin-cat2-${categoryId}` });
    const productId = createId();
    await db.insert(schema.products).values({
      id: productId,
      slug: `orders-admin-product2-${productId}`,
      name: "P",
      categoryId,
      pricePaise: 1000,
      gstRateBps: 1200,
      status: "active",
    });
    const variantId = createId();
    await db
      .insert(schema.productVariants)
      .values({ id: variantId, productId, sku: `SKU2-${variantId}`, size: "M", color: "Red" });
    await db.insert(schema.inventory).values({ variantId, onHand: 5, reserved: 0 });
    const razorpay = createMockRazorpay();
    const created = await createOrder(
      { lines: [{ variantId, quantity: 1 }], addressId, idempotencyKey: createId() },
      { userId, customerName: "X", customerEmail: `x-${userId}@indiakitsch.test` },
      db,
      razorpay,
    );
    if (!created.ok) throw new Error("setup failed");

    await expect(
      refundOrder(
        { orderId: created.orderId, reason: "x" },
        adminUserId,
        db,
        razorpay,
        mockEmailSender,
      ),
    ).rejects.toThrow();
  });
});

describe("cancelPaidOrder", () => {
  it("fully refunds, restocks, and cancels a paid order", async () => {
    const { orderId, variantId, razorpay } = await createPaidOrder(5, 2);
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });

    const { result } = await cancelPaidOrder(
      { orderId, reason: "customer request" },
      adminUserId,
      db,
      razorpay,

      mockEmailSender,
    );

    expect(result.status).toBe("cancelled");
    expect(result.refundedPaise).toBe(order!.totalPaise);

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.onHand).toBe(5); // 5 - 2 sold + 2 returned
  });

  it("rejects cancelling an order that's already shipped", async () => {
    const { orderId, razorpay } = await createPaidOrder();
    await markOrderProcessing(orderId, adminUserId, db);
    await markOrderShipped(
      { orderId, courier: "X", trackingNumber: "Y" },
      adminUserId,
      db,
      mockEmailSender,
    );

    await expect(
      cancelPaidOrder({ orderId, reason: "x" }, adminUserId, db, razorpay, mockEmailSender),
    ).rejects.toThrow();
  });
});

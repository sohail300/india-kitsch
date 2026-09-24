/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Razorpay's HTTP layer is mocked; everything else
 * (order state transitions, stock sale, webhook idempotency, the
 * reconciler's two sweeps) runs against the real database, building real
 * pending_payment orders via the already-verified `createOrder` first.
 */
import { createHmac } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import type { EmailSender } from "@/server/lib/email";
import { env } from "@/server/lib/env";
import { createId } from "@/server/lib/ids";
import { createOrder } from "@/server/modules/checkout/createOrder";
import { markOrderPaid } from "@/server/modules/orders/service";
import { reconcileExpiredOrders } from "@/server/modules/payments/reconcile";
import { RazorpayClient } from "@/server/modules/payments/razorpay";
import type { RazorpayPayment } from "@/server/modules/payments/razorpay";
import { verifyPayment } from "@/server/modules/payments/verify";
import { handleRazorpayWebhook } from "@/server/modules/payments/webhook";
import { migrateTestDb } from "../setup/migrate-test-db";

const WEBHOOK_SECRET = "test_webhook_secret";
// verifyPayment always signs with the real configured RAZORPAY_KEY_SECRET
// (there's only ever one "real" key secret, unlike the DB or the Razorpay
// HTTP client, which legitimately differ per environment and so are
// injectable) — tests sign with the same real value to match.
const KEY_SECRET = env.RAZORPAY_KEY_SECRET;

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

// A no-op sender — every order/payment function that might send a
// transactional email takes an injectable EmailSender (same DI pattern as
// razorpay); without passing this explicitly, these tests would silently
// hit the real Resend API on every run (RESEND_API_KEY is a real key here).
const mockEmailSender: EmailSender = { send: async () => {} };

/** A scriptable fake Razorpay: order creation always succeeds; payment/refund responses are queued per test. */
function createMockRazorpay() {
  const orderPaymentsQueue = new Map<string, RazorpayPayment[]>();
  const singlePaymentQueue = new Map<string, RazorpayPayment>();
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
    const orderPaymentsMatch = /\/orders\/([^/]+)\/payments$/.exec(urlStr);
    if (orderPaymentsMatch) {
      const items = orderPaymentsQueue.get(orderPaymentsMatch[1]!) ?? [];
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    const singlePaymentMatch = /\/payments\/([^/]+)$/.exec(urlStr);
    if (singlePaymentMatch && (!init || init.method === undefined)) {
      const payment = singlePaymentQueue.get(singlePaymentMatch[1]!);
      if (payment) return new Response(JSON.stringify(payment), { status: 200 });
      return new Response(JSON.stringify({ error: { description: "not found" } }), { status: 404 });
    }
    const refundMatch = /\/payments\/([^/]+)\/refund$/.exec(urlStr);
    if (refundMatch && init?.method === "POST") {
      refundCounter++;
      // razorpay_refund_id is globally unique in the DB — createId() keeps
      // every mock's refunds unique across the whole test file, not just
      // within one mock instance's own counter.
      return new Response(
        JSON.stringify({
          id: `rfnd_mock_${refundCounter}_${createId()}`,
          payment_id: refundMatch[1],
          amount: 0,
          status: "processed",
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: { description: "unmocked endpoint" } }), {
      status: 404,
    });
  }) as typeof fetch;

  return {
    razorpay: new RazorpayClient({ keyId: "test_key_id", keySecret: KEY_SECRET, fetchImpl }),
    queueOrderPayments(razorpayOrderId: string, payments: RazorpayPayment[]) {
      orderPaymentsQueue.set(razorpayOrderId, payments);
    },
    queueSinglePayment(paymentId: string, payment: RazorpayPayment) {
      singlePaymentQueue.set(paymentId, payment);
    },
  };
}

function mockPayment(
  overrides: Partial<RazorpayPayment> & { id: string; order_id: string; amount: number },
): RazorpayPayment {
  return {
    currency: "INR",
    status: "captured",
    method: "card",
    error_code: null,
    error_description: null,
    ...overrides,
  };
}

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  await db.delete(schema.webhookEvents).where(like(schema.webhookEvents.id, "evt_%"));
  if (createdUserIds.length > 0) {
    const userOrders = await db.query.orders.findMany({
      where: inArray(schema.orders.userId, createdUserIds),
    });
    const orderIds = userOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      await db.delete(schema.refunds).where(inArray(schema.refunds.orderId, orderIds));
      await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds));
      await db.delete(schema.payments).where(inArray(schema.payments.orderId, orderIds));
      await db
        .delete(schema.couponRedemptions)
        .where(inArray(schema.couponRedemptions.orderId, orderIds));
      await db.delete(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
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
  await db.insert(schema.user).values({
    id,
    name: "Payments Test",
    email: `payments-${id}@indiakitsch.test`,
    emailVerified: true,
  });
  return id;
}

async function createTestAddress(userId: string): Promise<string> {
  const id = createId();
  await db.insert(schema.addresses).values({
    id,
    userId,
    fullName: "Payments Test",
    phone: "9999999999",
    line1: "1 Test Street",
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  });
  return id;
}

async function createTestVariant(onHand: number): Promise<string> {
  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `payments-test-cat-${categoryId}` });
  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `payments-test-product-${productId}`,
    name: "Payments Test Product",
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
  return variantId;
}

/** Builds a real pending_payment order via createOrder (with a mock Razorpay), the shared setup every test below needs. */
async function createPendingOrder(onHand = 5, quantity = 1) {
  const userId = await createTestUser();
  const addressId = await createTestAddress(userId);
  const variantId = await createTestVariant(onHand);
  const mock = createMockRazorpay();

  const result = await createOrder(
    { lines: [{ variantId, quantity }], addressId, idempotencyKey: createId() },
    { userId, customerName: "Payments Test", customerEmail: `payments-${userId}@indiakitsch.test` },
    db,
    mock.razorpay,
  );
  if (!result.ok) throw new Error(`setup failed: ${JSON.stringify(result)}`);

  return { userId, variantId, order: result, mock };
}

function webhookBody(event: string, payload: unknown): string {
  return JSON.stringify({ event, payload });
}

function signBody(body: string, secret: string = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("markOrderPaid", () => {
  it("transitions to paid, sells the reservation, and captures the payment row", async () => {
    const { order, variantId } = await createPendingOrder(5, 2);

    const result = await markOrderPaid(
      { orderId: order.orderId, razorpayPaymentId: "pay_1", method: "card", actor: "customer" },
      db,

      mockEmailSender,
    );

    expect(result.alreadyProcessed).toBe(false);
    expect(result.order?.status).toBe("paid");

    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.onHand).toBe(3); // 5 - 2 sold
    expect(inventoryRow?.reserved).toBe(0);

    const [paymentRow] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.orderId));
    expect(paymentRow).toMatchObject({
      status: "captured",
      razorpayPaymentId: "pay_1",
      method: "card",
    });
  });

  it("is idempotent: a second call is a no-op, not a double-sale", async () => {
    const { order, variantId } = await createPendingOrder(5, 1);

    await markOrderPaid(
      { orderId: order.orderId, razorpayPaymentId: "pay_2", actor: "customer" },
      db,

      mockEmailSender,
    );
    const second = await markOrderPaid(
      { orderId: order.orderId, razorpayPaymentId: "pay_2", actor: "customer" },
      db,

      mockEmailSender,
    );

    expect(second.alreadyProcessed).toBe(true);
    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.onHand).toBe(4); // sold exactly once
  });
});

describe("verifyPayment", () => {
  it("marks the order paid when the signature and captured payment both check out", async () => {
    const { order, mock } = await createPendingOrder();
    mock.queueSinglePayment(
      "pay_verify_1",
      mockPayment({
        id: "pay_verify_1",
        order_id: order.razorpayOrderId,
        amount: order.amountPaise,
      }),
    );
    const signature = createHmac("sha256", KEY_SECRET)
      .update(`${order.razorpayOrderId}|pay_verify_1`)
      .digest("hex");

    const result = await verifyPayment(
      { orderId: order.orderId, razorpayPaymentId: "pay_verify_1", razorpaySignature: signature },
      db,
      mock.razorpay,

      mockEmailSender,
    );

    expect(result).toEqual({ ok: true, orderId: order.orderId });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid");
  });

  it("rejects a tampered signature and does not mark the order paid", async () => {
    const { order, mock } = await createPendingOrder();

    const result = await verifyPayment(
      {
        orderId: order.orderId,
        razorpayPaymentId: "pay_bad",
        razorpaySignature: "not-a-real-signature",
      },
      db,
      mock.razorpay,

      mockEmailSender,
    );

    expect(result).toMatchObject({ ok: false, code: "signature_invalid" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("pending_payment");
  });

  it("rejects when the fetched payment amount doesn't match the order", async () => {
    const { order, mock } = await createPendingOrder();
    mock.queueSinglePayment(
      "pay_verify_2",
      mockPayment({
        id: "pay_verify_2",
        order_id: order.razorpayOrderId,
        amount: order.amountPaise + 1,
      }),
    );
    const signature = createHmac("sha256", KEY_SECRET)
      .update(`${order.razorpayOrderId}|pay_verify_2`)
      .digest("hex");

    const result = await verifyPayment(
      { orderId: order.orderId, razorpayPaymentId: "pay_verify_2", razorpaySignature: signature },
      db,
      mock.razorpay,

      mockEmailSender,
    );

    expect(result).toMatchObject({ ok: false, code: "amount_mismatch" });
  });
});

describe("handleRazorpayWebhook", () => {
  it("marks the order paid on a valid payment.captured event", async () => {
    const { order } = await createPendingOrder();
    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_1",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });

    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "processed" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid");
  });

  it("rejects an invalid signature with 400 and processes nothing", async () => {
    const { order } = await createPendingOrder();
    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_2",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });

    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: "wrong-signature", eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(result).toEqual({ status: 400, outcome: "invalid_signature" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("pending_payment");
  });

  it("is idempotent: a replayed event id is a no-op the second time", async () => {
    const { order } = await createPendingOrder();
    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_3",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });
    const eventId = `evt_${createId()}`;

    const first = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );
    const second = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(first.outcome).toBe("processed");
    expect(second).toEqual({ status: 200, outcome: "duplicate" });
  });

  it("records a payment.failed event without changing the order's status", async () => {
    const { order } = await createPendingOrder();
    const body = webhookBody("payment.failed", {
      payment: {
        entity: {
          id: "pay_wh_fail",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "card",
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Card declined",
        },
      },
    });

    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "payment_failure_recorded" });
    const failedPayment = await db.query.payments.findFirst({
      where: eq(schema.payments.razorpayPaymentId, "pay_wh_fail"),
    });
    expect(failedPayment).toMatchObject({ status: "failed", errorCode: "BAD_REQUEST_ERROR" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("pending_payment");
  });

  it("rejects with amount_mismatch when the captured amount doesn't match the order total, and leaves the order pending", async () => {
    const { order } = await createPendingOrder();
    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_mismatch",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise + 100, // tampered/short amount
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });

    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "amount_mismatch" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("pending_payment");
    const paymentRows = await db.query.payments.findMany({
      where: eq(schema.payments.orderId, order.orderId),
    });
    expect(paymentRows.every((p) => p.status !== "captured")).toBe(true);
  });

  it("processes an out-of-order payment.failed arriving after the order was already paid, without changing its status", async () => {
    const { order } = await createPendingOrder();
    const capturedBody = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_ooo_1",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });
    const capturedResult = await handleRazorpayWebhook(
      { rawBody: capturedBody, signature: signBody(capturedBody), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );
    expect(capturedResult.outcome).toBe("processed");

    // A stale payment.failed for a different attempt on the same order,
    // delivered late (Razorpay/network reordering) after payment.captured
    // already settled it — the order must stay paid.
    const failedBody = webhookBody("payment.failed", {
      payment: {
        entity: {
          id: "pay_ooo_2",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "card",
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Card declined (arrived after capture)",
        },
      },
    });
    const failedResult = await handleRazorpayWebhook(
      { rawBody: failedBody, signature: signBody(failedBody), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(failedResult).toEqual({ status: 200, outcome: "payment_failure_recorded" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid"); // the earlier capture is not undone by the late failure record
  });

  it("updates a refund's status on refund.processed", async () => {
    const { order } = await createPendingOrder();
    await markOrderPaid(
      { orderId: order.orderId, razorpayPaymentId: "pay_for_refund", actor: "customer" },
      db,

      mockEmailSender,
    );
    const paymentRow = await db.query.payments.findFirst({
      where: eq(schema.payments.razorpayPaymentId, "pay_for_refund"),
    });
    await db.insert(schema.refunds).values({
      orderId: order.orderId,
      paymentId: paymentRow!.id,
      razorpayRefundId: "rfnd_wh_1",
      amountPaise: order.amountPaise,
      status: "pending",
    });

    const body = webhookBody("refund.processed", {
      refund: { entity: { id: "rfnd_wh_1", status: "processed" } },
    });
    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,

      undefined,
      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "refund_updated" });
    const refundRow = await db.query.refunds.findFirst({
      where: eq(schema.refunds.razorpayRefundId, "rfnd_wh_1"),
    });
    expect(refundRow?.status).toBe("processed");
  });

  it("reinstates a late payment directly (docs/12's doc gap: the webhook handles this itself, not only the 10-minute reconciler)", async () => {
    const { order, variantId, mock } = await createPendingOrder(5, 1);
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, []);
    await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender); // gets the order into cancelled/expired, same as the real lost-webhook path would

    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_late_1",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });
    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,
      mock.razorpay,

      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "late_payment_reinstated" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid");
    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.onHand).toBe(4); // sold
  });

  it("auto-refunds a late payment directly when the webhook fires and stock is gone", async () => {
    const { order, variantId, mock } = await createPendingOrder(1, 1);
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, []);
    await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    await db
      .update(schema.inventory)
      .set({ reserved: 1 })
      .where(eq(schema.inventory.variantId, variantId)); // someone else took the freed unit

    const body = webhookBody("payment.captured", {
      payment: {
        entity: {
          id: "pay_wh_late_2",
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          method: "upi",
          error_code: null,
          error_description: null,
        },
      },
    });
    const result = await handleRazorpayWebhook(
      { rawBody: body, signature: signBody(body), eventId: `evt_${createId()}` },
      db,
      WEBHOOK_SECRET,
      mock.razorpay,

      mockEmailSender,
    );

    expect(result).toEqual({ status: 200, outcome: "late_payment_refunded" });
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("cancelled");
    const paymentRow = await db.query.payments.findFirst({
      where: eq(schema.payments.razorpayPaymentId, "pay_wh_late_2"),
    });
    expect(paymentRow?.status).toBe("refunded");
    const refundRow = await db.query.refunds.findFirst({
      where: eq(schema.refunds.paymentId, paymentRow!.id),
    });
    expect(refundRow).toBeDefined();

    await db
      .update(schema.inventory)
      .set({ reserved: 0 })
      .where(eq(schema.inventory.variantId, variantId));
  });
});

describe("reconcileExpiredOrders", () => {
  it("marks an expired order paid when Razorpay shows a captured payment (lost-webhook recovery)", async () => {
    const { order, mock } = await createPendingOrder();
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, [
      mockPayment({
        id: "pay_recon_1",
        order_id: order.razorpayOrderId,
        amount: order.amountPaise,
      }),
    ]);

    const result = await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    expect(result.markedPaid).toBeGreaterThanOrEqual(1);
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid");
  });

  it("cancels an expired order with no captured payment and releases its stock", async () => {
    const { order, variantId, mock } = await createPendingOrder(3, 2);
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, []);

    const result = await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    expect(result.cancelled).toBeGreaterThanOrEqual(1);
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("cancelled");
    expect(dbOrder?.cancelReason).toBe("expired");
    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.reserved).toBe(0);
  });

  it("reinstates a late payment on an already-cancelled order when stock is still available", async () => {
    const { order, variantId, mock } = await createPendingOrder(5, 1);
    // Expire + sweep once to get the order into "cancelled, reason expired".
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, []);
    await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    // Now a late captured payment shows up.
    mock.queueOrderPayments(order.razorpayOrderId, [
      mockPayment({ id: "pay_late_1", order_id: order.razorpayOrderId, amount: order.amountPaise }),
    ]);
    const result = await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    expect(result.latePaymentReinstated).toBeGreaterThanOrEqual(1);
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("paid");
    const [inventoryRow] = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.variantId, variantId));
    expect(inventoryRow?.onHand).toBe(4); // sold
    expect(inventoryRow?.reserved).toBe(0);
  });

  it("auto-refunds a late payment when the stock is no longer available", async () => {
    const { order, variantId, mock } = await createPendingOrder(1, 1);
    await db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.orders.id, order.orderId));
    mock.queueOrderPayments(order.razorpayOrderId, []);
    await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    // Someone else takes the now-freed single unit.
    await db
      .update(schema.inventory)
      .set({ reserved: 1 })
      .where(eq(schema.inventory.variantId, variantId));

    mock.queueOrderPayments(order.razorpayOrderId, [
      mockPayment({ id: "pay_late_2", order_id: order.razorpayOrderId, amount: order.amountPaise }),
    ]);
    const result = await reconcileExpiredOrders(db, mock.razorpay, undefined, mockEmailSender);

    expect(result.latePaymentRefunded).toBeGreaterThanOrEqual(1);
    const dbOrder = await db.query.orders.findFirst({ where: eq(schema.orders.id, order.orderId) });
    expect(dbOrder?.status).toBe("cancelled"); // never reinstated
    const refundRow = await db.query.refunds.findFirst({
      where: eq(schema.refunds.orderId, order.orderId),
    });
    expect(refundRow).toBeDefined();

    await db
      .update(schema.inventory)
      .set({ reserved: 0 })
      .where(eq(schema.inventory.variantId, variantId));
  });
});

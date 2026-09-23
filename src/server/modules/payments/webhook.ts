import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { payments, refunds, webhookEvents } from "@/server/db/schema";
import { env } from "@/server/lib/env";
import { getOrderByRazorpayOrderId } from "@/server/modules/orders/queries";
import { createRazorpayClient, verifyWebhookSignature } from "./razorpay";
import type { RazorpayClient } from "./razorpay";
import { settleCapturedPayment } from "./settle";

/**
 * Minimal shape of the fields this handler actually reads from Razorpay's
 * webhook payload — not the full API surface, just what dispatch needs.
 */
interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        method: string | null;
        error_code: string | null;
        error_description: string | null;
      };
    };
    refund?: {
      entity: { id: string; status: string };
    };
  };
}

export interface WebhookInput {
  rawBody: string;
  /** The `X-Razorpay-Signature` header. */
  signature: string | null;
  /** The `X-Razorpay-Event-Id` header — the webhook_events idempotency key (docs/06 §9 step 5). */
  eventId: string | null;
}

export interface WebhookResult {
  status: number;
  outcome: string;
}

/**
 * The webhook is the payment source of truth (docs/06 §9 step 5) — this
 * function is exercised directly in tests with a hand-built payload/
 * signature, and the route handler (app/api/webhooks/razorpay/route.ts)
 * only does the HTTP plumbing (reading the raw body, extracting headers,
 * mapping this result to a Response).
 */
export async function handleRazorpayWebhook(
  input: WebhookInput,
  dbHandle: Db = db,
  webhookSecret: string | undefined = env.RAZORPAY_WEBHOOK_SECRET,
  razorpay: RazorpayClient = createRazorpayClient(),
): Promise<WebhookResult> {
  if (!webhookSecret) {
    return { status: 503, outcome: "webhook_secret_not_configured" };
  }
  if (
    !input.signature ||
    !verifyWebhookSignature({ rawBody: input.rawBody, signature: input.signature }, webhookSecret)
  ) {
    return { status: 400, outcome: "invalid_signature" };
  }
  if (!input.eventId) {
    return { status: 400, outcome: "missing_event_id" };
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(input.rawBody) as RazorpayWebhookEvent;
  } catch {
    return { status: 400, outcome: "invalid_json" };
  }

  // Idempotency/replay guard (docs/06 §9 step 5): the PK insert either
  // succeeds (first time seeing this event) or is a no-op (duplicate/replay).
  const inserted = await dbHandle
    .insert(webhookEvents)
    .values({ id: input.eventId, type: event.event })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return { status: 200, outcome: "duplicate" };
  }

  const outcome = await dispatch(event, dbHandle, razorpay);
  await dbHandle
    .update(webhookEvents)
    .set({ processedAt: new Date(), outcome })
    .where(eq(webhookEvents.id, input.eventId));

  return { status: 200, outcome };
}

async function dispatch(
  event: RazorpayWebhookEvent,
  dbHandle: Db,
  razorpay: RazorpayClient,
): Promise<string> {
  switch (event.event) {
    case "payment.captured":
    case "order.paid":
      return handlePaymentCaptured(event, dbHandle, razorpay);
    case "payment.failed":
      return handlePaymentFailed(event, dbHandle);
    case "refund.processed":
    case "refund.failed":
      return handleRefundUpdate(event, dbHandle);
    default:
      return "ignored";
  }
}

/**
 * Handles both the ordinary case (order still `pending_payment`) and the
 * late-payment case (order already auto-cancelled for expiry) via the same
 * `settleCapturedPayment` the reconciler uses (docs/12 "One doc gap to
 * close before Phase 6 code") — a late payer gets reinstated or refunded
 * as soon as this webhook arrives, not up to 10 minutes later.
 */
async function handlePaymentCaptured(
  event: RazorpayWebhookEvent,
  dbHandle: Db,
  razorpay: RazorpayClient,
): Promise<string> {
  const payment = event.payload.payment?.entity;
  if (!payment) return "malformed_payload";

  const order = await getOrderByRazorpayOrderId(payment.order_id, dbHandle);
  if (!order) return "order_not_found";

  const captured = {
    id: payment.id,
    order_id: payment.order_id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: "captured" as const,
    error_code: payment.error_code,
    error_description: payment.error_description,
  };

  const outcome = await settleCapturedPayment(order, captured, "razorpay", dbHandle, razorpay);
  switch (outcome) {
    case "paid":
      return "processed";
    case "reinstated":
      return "late_payment_reinstated";
    case "refunded":
      return "late_payment_refunded";
    case "amount_mismatch":
      return "amount_mismatch";
    case "not_applicable":
      return "order_not_pending_or_cancelled"; // already paid, or cancelled for a reason other than expiry
  }
}

async function handlePaymentFailed(event: RazorpayWebhookEvent, dbHandle: Db): Promise<string> {
  const payment = event.payload.payment?.entity;
  if (!payment) return "malformed_payload";

  const order = await getOrderByRazorpayOrderId(payment.order_id, dbHandle);
  if (!order) return "order_not_found";

  // Records the attempt — the order stays pending_payment, the customer
  // may retry on the same Razorpay order (docs/06 §9 step 5).
  await dbHandle.insert(payments).values({
    orderId: order.id,
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    status: "failed",
    amountPaise: payment.amount,
    method: payment.method,
    errorCode: payment.error_code,
    errorDescription: payment.error_description,
  });
  return "payment_failure_recorded";
}

async function handleRefundUpdate(event: RazorpayWebhookEvent, dbHandle: Db): Promise<string> {
  const refund = event.payload.refund?.entity;
  if (!refund) return "malformed_payload";

  const updated = await dbHandle
    .update(refunds)
    .set({ status: refund.status })
    .where(eq(refunds.razorpayRefundId, refund.id))
    .returning({ id: refunds.id });

  return updated.length > 0 ? "refund_updated" : "refund_not_found";
}

import "server-only";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { env } from "@/server/lib/env";
import { getOrderById } from "@/server/modules/orders/queries";
import { markOrderPaid } from "@/server/modules/orders/service";
import { createRazorpayClient, verifyPaymentSignature } from "./razorpay";
import type { RazorpayClient } from "./razorpay";

export interface VerifyPaymentInput {
  orderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export type VerifyPaymentResult =
  | { ok: true; orderId: string }
  | {
      ok: false;
      code: "order_not_found" | "signature_invalid" | "payment_not_captured" | "amount_mismatch";
      message: string;
    };

/**
 * The Razorpay Checkout success handler's fast path (docs/06 §9 step 4) -
 * a UX convenience only, so the customer sees confirmation immediately
 * instead of waiting on the webhook. Recomputes the HMAC signature,
 * independently fetches the payment from Razorpay's API (never trusts the
 * client's claim that it succeeded), and cross-checks amount/currency/order
 * linkage before calling the same `markOrderPaid` the webhook and
 * reconciler use - **the webhook remains the source of truth** (docs/06 §9
 * step 5); this path existing or failing changes nothing about whether the
 * order eventually gets marked paid.
 */
export async function verifyPayment(
  input: VerifyPaymentInput,
  dbHandle: Db = db,
  razorpay: RazorpayClient = createRazorpayClient(),
  emailSender: EmailSender = defaultEmailSender,
): Promise<VerifyPaymentResult> {
  const order = await getOrderById(input.orderId, dbHandle);
  if (!order || !order.razorpayOrderId) {
    return { ok: false, code: "order_not_found", message: "Order not found" };
  }

  const signatureValid = verifyPaymentSignature(
    {
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    },
    env.RAZORPAY_KEY_SECRET,
  );
  if (!signatureValid) {
    return {
      ok: false,
      code: "signature_invalid",
      message: "Payment signature could not be verified",
    };
  }

  const payment = await razorpay.fetchPayment(input.razorpayPaymentId);
  if (payment.status !== "captured") {
    return {
      ok: false,
      code: "payment_not_captured",
      message: `Payment status is "${payment.status}", not captured`,
    };
  }
  if (
    payment.order_id !== order.razorpayOrderId ||
    payment.amount !== order.totalPaise ||
    payment.currency !== order.currency
  ) {
    return { ok: false, code: "amount_mismatch", message: "Payment does not match this order" };
  }

  await markOrderPaid(
    {
      orderId: order.id,
      razorpayPaymentId: input.razorpayPaymentId,
      method: payment.method ?? undefined,
      actor: "customer",
    },
    dbHandle,
    emailSender,
  );

  return { ok: true, orderId: order.id };
}

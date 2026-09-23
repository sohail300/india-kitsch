import "server-only";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { payments, refunds } from "@/server/db/schema";
import { OutOfStockError } from "@/server/lib/errors";
import { reserveStock, sellReservedStock } from "@/server/modules/inventory/service";
import { getOrderItems } from "@/server/modules/orders/queries";
import { markOrderPaid, recordCapturedPayment } from "@/server/modules/orders/service";
import { transition } from "@/server/modules/orders/stateMachine";
import type { Order } from "@/server/modules/orders/stateMachine";
import type { RazorpayClient, RazorpayPayment } from "./razorpay";

export type SettleOutcome =
  "paid" | "reinstated" | "refunded" | "amount_mismatch" | "not_applicable";

/**
 * The single place that decides what a captured Razorpay payment means for
 * an order — shared by the webhook handler and the reconciler (docs/12
 * "One doc gap to close before Phase 6 code": late-payment handling has to
 * run in the webhook directly, not only the 10-minute reconciler, so a late
 * payer isn't waiting up to 10 minutes for their order to confirm). Both
 * callers fetch the order and the captured payment themselves (from a
 * webhook payload or from `razorpay.fetchOrderPayments`) and hand them
 * here; this function only decides and executes what happens next.
 */
export async function settleCapturedPayment(
  order: Order,
  captured: RazorpayPayment,
  actor: "razorpay" | "system",
  dbHandle: Db = db,
  razorpay?: RazorpayClient,
): Promise<SettleOutcome> {
  if (captured.amount !== order.totalPaise || captured.currency !== order.currency) {
    return "amount_mismatch";
  }

  if (order.status === "pending_payment") {
    await markOrderPaid(
      {
        orderId: order.id,
        razorpayPaymentId: captured.id,
        method: captured.method ?? undefined,
        actor,
      },
      dbHandle,
    );
    return "paid";
  }

  if (order.status === "cancelled" && order.cancelReason === "expired") {
    const reinstated = await tryReinstateLatePayment(dbHandle, order, captured);
    if (reinstated) return "reinstated";

    // Stock is gone or the order moved on — refund instead (docs/06 §9
    // step 7: "else auto-refund and email the customer"). Requires a
    // RazorpayClient — the webhook handler always has one; if this is ever
    // called without one for a case that needs it, that's a caller bug.
    if (!razorpay) {
      throw new Error(
        "settleCapturedPayment: a RazorpayClient is required to auto-refund a late payment",
      );
    }
    await refundLatePayment(dbHandle, razorpay, order, captured);
    return "refunded";
  }

  return "not_applicable";
}

/**
 * Attempts `cancelled -> paid`: re-reserve the stock this order gave back
 * on cancellation, then transition and sell it, all in one transaction so
 * a failure at any step leaves nothing half-done. Returns false (not an
 * error) for the ordinary case where stock ran out or someone else already
 * changed the order — the caller falls back to a refund.
 */
async function tryReinstateLatePayment(
  dbHandle: Db,
  order: Order,
  captured: RazorpayPayment,
): Promise<boolean> {
  try {
    return await dbHandle.transaction(async (tx) => {
      const items = await getOrderItems(order.id, tx);
      const lines = items
        .filter((i) => i.variantId)
        .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));

      await reserveStock(tx, lines, { orderId: order.id, note: "late payment re-reservation" });

      const updated = await transition(tx, order.id, "cancelled", "paid", "system", {
        note: `late payment ${captured.id} reconciled`,
      });
      if (!updated) return false;

      await sellReservedStock(tx, lines, {
        orderId: order.id,
        note: "sale on late payment reconciliation",
      });
      await recordCapturedPayment(tx, order.id, captured.id, captured.method ?? undefined);

      return true;
    });
  } catch (error) {
    if (error instanceof OutOfStockError) return false;
    throw error;
  }
}

/**
 * No local `payments` row exists for this attempt yet (the order was
 * cancelled before this capture was ever seen) — `refunds.paymentId` has a
 * hard FK, so one has to be created first.
 */
async function refundLatePayment(
  dbHandle: Db,
  razorpay: RazorpayClient,
  order: Order,
  captured: RazorpayPayment,
): Promise<void> {
  const refund = await razorpay.createRefund(captured.id, {
    notes: { reason: "late payment on an already-cancelled order; stock no longer available" },
  });

  await dbHandle.transaction(async (tx) => {
    const [paymentRow] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        razorpayOrderId: order.razorpayOrderId!,
        razorpayPaymentId: captured.id,
        status: "refunded",
        amountPaise: captured.amount,
        method: captured.method,
      })
      .returning({ id: payments.id });

    await tx.insert(refunds).values({
      orderId: order.id,
      paymentId: paymentRow!.id,
      razorpayRefundId: refund.id,
      amountPaise: captured.amount,
      reason: "late payment, order already cancelled, stock unavailable",
      status: refund.status,
    });
  });
}

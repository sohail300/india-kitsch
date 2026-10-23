import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db, Tx } from "@/server/db/client";
import { payments } from "@/server/db/schema";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { releaseCoupon } from "@/server/modules/coupons/service";
import { releaseStock, sellReservedStock } from "@/server/modules/inventory/service";
import { sendOrderConfirmationEmail } from "@/server/modules/notifications/service";
import { getExpiredPendingOrderIdsForVariants, getOrderById, getOrderItems } from "./queries";
import type { Order } from "./stateMachine";
import { transition } from "./stateMachine";

export interface MarkOrderPaidInput {
  orderId: string;
  razorpayPaymentId: string;
  method?: string;
  /** "customer" (verify fast-path), "razorpay" (webhook), or "system" (reconciler) - docs/06 §9. */
  actor: string;
}

export interface MarkOrderPaidResult {
  /** true if this call found the order already paid (or otherwise not pending_payment) and did nothing - the shared idempotency contract (docs/06 §9 step 6) callable from verify, webhook, and the reconciler without risk of double-processing. */
  alreadyProcessed: boolean;
  order: Order | null;
}

/**
 * Idempotent and shared by the verify fast-path, the webhook, and the
 * reconciler (docs/06 §9 step 6). One transaction: transition
 * pending_payment -> paid (a no-op if it's already past that state),
 * convert the reservation to a sale, and record the actual payment. The
 * confirmation email is sent after the transaction commits, never inside
 * it - an external HTTP call has no business holding a DB connection open,
 * and a failed send (logged, not thrown - see notifications/service.ts)
 * must never roll back an order that's genuinely paid.
 */
export async function markOrderPaid(
  input: MarkOrderPaidInput,
  dbHandle: Db = db,
  emailSender: EmailSender = defaultEmailSender,
): Promise<MarkOrderPaidResult> {
  const result = await dbHandle.transaction(async (tx) => {
    const updated = await transition(tx, input.orderId, "pending_payment", "paid", input.actor, {
      note: `razorpay payment ${input.razorpayPaymentId}`,
    });

    if (!updated) {
      const current = await getOrderById(input.orderId, tx);
      return { alreadyProcessed: true, order: current ?? null };
    }

    const items = await getOrderItems(input.orderId, tx);
    const lines = items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
    if (lines.length > 0) {
      await sellReservedStock(tx, lines, {
        orderId: input.orderId,
        note: "sale on payment capture",
      });
    }

    await recordCapturedPayment(tx, input.orderId, input.razorpayPaymentId, input.method);

    return { alreadyProcessed: false, order: updated };
  });

  if (!result.alreadyProcessed) {
    await sendOrderConfirmationEmail(input.orderId, dbHandle, emailSender);
  }

  return result;
}

/**
 * Marks the payment attempt captured - updates the row already recorded for
 * this `razorpayPaymentId` if one exists (e.g. the webhook saw `payment.
 * authorized` first), otherwise the original placeholder row `createOrder`
 * inserted at order-creation time (`status: "created"`, no payment id yet).
 * Exported for the reconciler's late-payment path (payments/reconcile.ts),
 * which needs the same payment bookkeeping but drives its own transition.
 */
export async function recordCapturedPayment(
  tx: Tx,
  orderId: string,
  razorpayPaymentId: string,
  method?: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.razorpayPaymentId, razorpayPaymentId)));

  if (existing) {
    await tx
      .update(payments)
      .set({ status: "captured", method })
      .where(eq(payments.id, existing.id));
    return;
  }

  await tx
    .update(payments)
    .set({ status: "captured", razorpayPaymentId, method })
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "created")));
}

export interface CancelPendingOrderInput {
  orderId: string;
  reason: string;
  actor: string;
}

/**
 * Cancels a still-`pending_payment` order - releases its stock reservation
 * and any coupon usage. Used for the 5-minute expiry (both `createOrder`'s
 * lazy release and the reconciler's sweep) and customer self-cancel.
 * Deliberately scoped to `pending_payment -> cancelled` only: an *already
 * paid* order needs restocking `onHand` (it was sold, not just held) and a
 * real refund, which is an admin action Phase 7 builds separately - not the
 * same "give back a hold that was never fulfilled" operation as this one.
 */
export async function cancelPendingOrder(
  tx: Tx,
  input: CancelPendingOrderInput,
): Promise<Order | null> {
  const updated = await transition(tx, input.orderId, "pending_payment", "cancelled", input.actor, {
    cancelReason: input.reason,
  });
  if (!updated) return null;

  const items = await getOrderItems(input.orderId, tx);
  const lines = items
    .filter((i) => i.variantId)
    .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
  if (lines.length > 0) {
    await releaseStock(tx, lines, { orderId: input.orderId, note: `cancelled: ${input.reason}` });
  }
  await releaseCoupon(tx, input.orderId);

  return updated;
}

/**
 * Releases any *other* pending_payment orders' expired reservations on
 * these variants (docs/06 §9 step 2iv) - run in its own short transaction
 * *before* `quoteCart`'s availability check, not inside the final
 * order-creation transaction: a stale hold has to actually be gone before
 * the pre-check reads stock, or the pre-check blocks a purchase the release
 * was supposed to unblock. Any residual race after this (another buyer
 * grabbing the now-free stock before this checkout's own reservation) is
 * still fully protected by `reserveStock`'s atomic conditional UPDATE in
 * the main transaction - this function is a courtesy, not the correctness
 * guarantee.
 */
export async function releaseExpiredReservationsForVariants(
  variantIds: string[],
  dbHandle: Db = db,
): Promise<void> {
  if (variantIds.length === 0) return;
  const expiredOrderIds = await getExpiredPendingOrderIdsForVariants(
    variantIds,
    new Date(),
    dbHandle,
  );
  for (const orderId of expiredOrderIds) {
    await dbHandle.transaction((tx) =>
      cancelPendingOrder(tx, { orderId, reason: "expired", actor: "system" }),
    );
  }
}

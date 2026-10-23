import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { orderEvents, orders } from "@/server/db/schema";
import { InvalidOrderTransitionError } from "@/server/lib/errors";

export type OrderStatus = (typeof orders.$inferSelect)["status"];

/**
 * The full legal-transition table (docs/06 §10). One edge is not in the
 * printed diagram but is real: `cancelled -> paid`, used only by the
 * reconciler's late-payment path (docs/06 §9 step 7) - a payment that
 * completes *after* an order was already auto-cancelled for expiry.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "cancelled", "refunded"],
  processing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: ["paid"],
  refunded: [],
};

export function isLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface TransitionOptions {
  note?: string;
  /** Required when transitioning to "shipped" (docs/06 §10: "courier + tracking number required"). */
  courier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  cancelReason?: string;
}

export type Order = typeof orders.$inferSelect;

/**
 * The one function allowed to write `orders.status` (docs/06 §10). Two
 * distinct failure modes:
 *  - an illegal (from, to) pair throws `InvalidOrderTransitionError` - a
 *    caller bug, checked before touching the DB;
 *  - a legal transition that loses the optimistic-concurrency race
 *    (`UPDATE ... WHERE id=:id AND status=:from`, someone else already
 *    changed it) returns `null` - not an error, the caller decides what
 *    that means for them (a no-op for idempotent callers like
 *    `markOrderPaid`, a real conflict for others).
 *
 * Must run inside the caller's transaction, alongside whatever side effects
 * (stock release, coupon release, ...) that transition implies - this
 * function only owns the status column and the `order_events` audit row.
 */
export async function transition(
  tx: Tx,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  actor: string,
  options: TransitionOptions = {},
): Promise<Order | null> {
  if (!isLegalTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
  if (to === "shipped" && (!options.courier || !options.trackingNumber)) {
    throw new Error("transition: courier and trackingNumber are required when moving to 'shipped'");
  }

  const now = new Date();
  const [updated] = await tx
    .update(orders)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "paid" ? { paidAt: now } : {}),
      ...(to === "shipped"
        ? {
            shippedAt: now,
            courier: options.courier,
            trackingNumber: options.trackingNumber,
            trackingUrl: options.trackingUrl ?? null,
          }
        : {}),
      ...(to === "delivered" ? { deliveredAt: now } : {}),
      ...(to === "cancelled"
        ? { cancelledAt: now, cancelReason: options.cancelReason ?? null }
        : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, from)))
    .returning();

  if (!updated) return null;

  await tx
    .insert(orderEvents)
    .values({ orderId, fromStatus: from, toStatus: to, actor, note: options.note });

  return updated;
}

import "server-only";
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema";

export async function getOrderById(orderId: string, dbHandle: DbOrTx = db) {
  return dbHandle.query.orders.findFirst({ where: eq(orders.id, orderId) });
}

export async function getOrderByRazorpayOrderId(razorpayOrderId: string, dbHandle: DbOrTx = db) {
  return dbHandle.query.orders.findFirst({ where: eq(orders.razorpayOrderId, razorpayOrderId) });
}

/** Idempotency check (docs/06 §9 step 2i): a repeat `createOrder` call with the same key returns the same order instead of creating a duplicate. */
export async function getOrderByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
  dbHandle: DbOrTx = db,
) {
  return dbHandle.query.orders.findFirst({
    where: and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey)),
  });
}

export async function getOrderItems(orderId: string, dbHandle: DbOrTx = db) {
  return dbHandle.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) });
}

/** `pending_payment` orders whose 5-minute hold has expired - the reconciler's primary sweep (docs/06 §9 step 7). */
export async function getExpiredPendingOrders(now: Date, dbHandle: DbOrTx = db) {
  return dbHandle.query.orders.findMany({
    where: and(eq(orders.status, "pending_payment"), lt(orders.expiresAt, now)),
  });
}

/**
 * Other `pending_payment` orders - besides the one currently being
 * created - that hold a reservation on any of these variants and have
 * already expired. `createOrder` releases these itself before reserving
 * stock for the new order (docs/06 §9 step 2iv "lazily releases expired
 * reservations"), so a shopper isn't blocked by a stale hold for up to the
 * full 10-minute reconciler interval.
 */
export async function getExpiredPendingOrderIdsForVariants(
  variantIds: string[],
  now: Date,
  dbHandle: DbOrTx = db,
): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const rows = await dbHandle
    .selectDistinct({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "pending_payment"),
        lt(orders.expiresAt, now),
        inArray(orderItems.variantId, variantIds),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Auto-cancelled (expired) orders within the lookback window, for the
 * reconciler's late-payment sweep (docs/06 §9 step 7: "detect late
 * payments on already-cancelled orders"). Deliberately excludes
 * admin-cancelled orders (`cancelReason` other than `"expired"`) - those
 * were cancelled on purpose, a late payment against one is a support case,
 * not something to silently reinstate.
 */
export async function getExpiredCancelledOrdersSince(since: Date, dbHandle: DbOrTx = db) {
  return dbHandle.query.orders.findMany({
    where: and(
      eq(orders.status, "cancelled"),
      eq(orders.cancelReason, "expired"),
      isNotNull(orders.razorpayOrderId),
      gte(orders.cancelledAt, since),
    ),
  });
}

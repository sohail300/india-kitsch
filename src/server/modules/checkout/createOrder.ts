import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { addresses, orderEvents, orderItems, orders, payments } from "@/server/db/schema";
import { env } from "@/server/lib/env";
import { CouponExhaustedError, OutOfStockError } from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import { quoteCart } from "@/server/modules/cart/quote";
import { redeemCoupon } from "@/server/modules/coupons/service";
import { reserveStock } from "@/server/modules/inventory/service";
import { releaseExpiredReservationsForVariants } from "@/server/modules/orders/service";
import { getOrderByIdempotencyKey } from "@/server/modules/orders/queries";
import { createRazorpayClient } from "@/server/modules/payments/razorpay";
import type { RazorpayClient } from "@/server/modules/payments/razorpay";
import { createOrderInputSchema } from "./schemas";

const RESERVATION_HOLD_MINUTES = 5;
/** Postgres's unique_violation SQLSTATE - see the idempotency-race handling below. */
const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface CreateOrderContext {
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
}

export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: number;
      razorpayOrderId: string;
      amountPaise: number;
      keyId: string;
      prefill: { name: string; email: string; contact: string };
    }
  | { ok: false; code: "address_not_found"; message: string }
  | {
      ok: false;
      code: "cart_changed";
      message: string;
      blockers: { variantId: string; status: string }[];
    }
  | { ok: false; code: "coupon_invalid"; message: string; couponCode: string }
  | { ok: false; code: "price_changed"; message: string; totalPaise: number }
  | { ok: false; code: "out_of_stock"; message: string; variantId: string }
  | { ok: false; code: "coupon_exhausted"; message: string; couponCode: string };

type Order = typeof orders.$inferSelect;

function orderToResult(order: Order): CreateOrderResult {
  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    razorpayOrderId: order.razorpayOrderId!,
    amountPaise: order.totalPaise,
    keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    prefill: { name: order.shipFullName, email: order.customerEmail, contact: order.customerPhone },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === POSTGRES_UNIQUE_VIOLATION
  );
}

/**
 * The checkout Server Action's service layer (docs/06 §9 step 2). No
 * prices or totals are trusted from the client - everything is recomputed
 * from `quoteCart` (reused, but treated strictly here: any line that isn't
 * exactly `"ok"` blocks the whole order rather than silently clamping, the
 * way the advisory cart page would). The Razorpay order is created first,
 * *outside* any DB transaction - a failure there leaves nothing to roll
 * back locally, and an orphan unpaid Razorpay order is harmless. Reserving
 * stock, redeeming the coupon and writing the order all happen in one
 * transaction after that.
 */
export async function createOrder(
  rawInput: unknown,
  context: CreateOrderContext,
  dbHandle: Db = db,
  razorpay: RazorpayClient = createRazorpayClient(),
): Promise<CreateOrderResult> {
  const input = createOrderInputSchema.parse(rawInput);

  const existing = await getOrderByIdempotencyKey(context.userId, input.idempotencyKey, dbHandle);
  if (existing) return orderToResult(existing);

  const address = await dbHandle.query.addresses.findFirst({
    where: and(eq(addresses.id, input.addressId), eq(addresses.userId, context.userId)),
  });
  if (!address) {
    return {
      ok: false,
      code: "address_not_found",
      message: "That address was not found on your account",
    };
  }

  // Must happen before quoteCart's availability read, not inside the final
  // reservation transaction - see releaseExpiredReservationsForVariants's
  // own comment for why.
  await releaseExpiredReservationsForVariants(
    input.lines.map((l) => l.variantId),
    dbHandle,
  );

  const quote = await quoteCart(
    input.lines,
    { userId: context.userId, couponCode: input.couponCode },
    dbHandle,
  );

  const blockers = [
    ...quote.lines
      .filter((l) => l.status !== "ok")
      .map((l) => ({ variantId: l.variantId, status: l.status })),
    ...quote.removedLines.map((r) => ({ variantId: r.variantId, status: r.reason })),
  ];
  if (blockers.length > 0) {
    return {
      ok: false,
      code: "cart_changed",
      message: "Some items in your cart changed - please review your cart before trying again",
      blockers,
    };
  }

  if (input.couponCode && quote.coupon?.ok !== true) {
    return {
      ok: false,
      code: "coupon_invalid",
      message:
        quote.coupon && !quote.coupon.ok ? quote.coupon.message : "Coupon could not be applied",
      couponCode: input.couponCode,
    };
  }

  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== quote.totalPaise) {
    return {
      ok: false,
      code: "price_changed",
      message: "The order total changed since you last saw it - please review before paying",
      totalPaise: quote.totalPaise,
    };
  }

  // Generated before the Razorpay call so the Razorpay `receipt` maps 1:1
  // to this order's own id - useful for reconciliation either direction.
  const orderId = createId();
  const razorpayOrder = await razorpay.createOrder({
    amountPaise: quote.totalPaise,
    receipt: orderId,
    notes: { userId: context.userId, orderId },
  });

  try {
    const order = await dbHandle.transaction(async (tx) => {
      // orders/order_items/payments/order_events go in first (docs/06 §9
      // step 2iv's own listed order) - stock_movements.order_id is a hard
      // FK to orders.id, so reserveStock/redeemCoupon (which both write
      // movement/redemption rows referencing this order) must run after
      // the order itself exists, not before.
      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_MINUTES * 60_000);

      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          id: orderId,
          userId: context.userId,
          subtotalPaise: quote.subtotalPaise,
          discountPaise: quote.discountPaise,
          shippingPaise: quote.shippingPaise,
          taxIncludedPaise: quote.taxIncludedPaise,
          totalPaise: quote.totalPaise,
          couponCode: input.couponCode,
          shipFullName: address.fullName,
          shipPhone: address.phone,
          shipLine1: address.line1,
          shipLine2: address.line2,
          shipCity: address.city,
          shipState: address.state,
          shipPincode: address.pincode,
          customerEmail: context.customerEmail,
          customerPhone: context.customerPhone ?? address.phone,
          razorpayOrderId: razorpayOrder.id,
          idempotencyKey: input.idempotencyKey,
          expiresAt,
          placedAt: now,
        })
        .returning();

      await tx.insert(orderItems).values(
        quote.lines.map((line) => ({
          orderId,
          variantId: line.variantId,
          productName: line.productName,
          sku: line.sku,
          size: line.size,
          color: line.color,
          imageKey: line.imageKey,
          unitPricePaise: line.unitPricePaise,
          mrpPaise: line.mrpPaise,
          quantity: line.quantity,
          gstRateBps: line.gstRateBps,
          lineTotalPaise: line.lineTotalPaise,
          lineDiscountPaise: line.lineDiscountPaise,
        })),
      );

      await tx.insert(payments).values({
        orderId,
        razorpayOrderId: razorpayOrder.id,
        status: "created",
        amountPaise: quote.totalPaise,
      });

      await tx
        .insert(orderEvents)
        .values({ orderId, fromStatus: null, toStatus: "pending_payment", actor: "system" });

      await reserveStock(
        tx,
        quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        { orderId },
      );

      if (input.couponCode && quote.coupon?.ok) {
        await redeemCoupon(tx, {
          couponId: quote.coupon.couponId,
          code: quote.coupon.code,
          userId: context.userId,
          orderId,
          amountPaise: quote.discountPaise,
        });
      }

      return insertedOrder!;
    });

    return orderToResult(order);
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return {
        ok: false,
        code: "out_of_stock",
        message: "One of the items in your cart just sold out",
        variantId: error.variantId,
      };
    }
    if (error instanceof CouponExhaustedError) {
      return {
        ok: false,
        code: "coupon_exhausted",
        message: "This coupon just reached its usage limit",
        couponCode: error.couponCode,
      };
    }
    // A concurrent double-click can lose the initial idempotency-key check
    // above and then collide on orders' unique (userId, idempotencyKey)
    // constraint instead - the other request is the real winner, so return
    // its order rather than surfacing a confusing DB error to this one.
    if (isUniqueViolation(error)) {
      const winner = await getOrderByIdempotencyKey(context.userId, input.idempotencyKey, dbHandle);
      if (winner) return orderToResult(winner);
    }
    throw error;
  }
}

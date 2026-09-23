import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { couponRedemptions, coupons } from "@/server/db/schema";
import { CouponExhaustedError } from "@/server/lib/errors";

export interface RedeemCouponInput {
  couponId: string;
  code: string;
  userId: string;
  orderId: string;
  amountPaise: number;
}

/**
 * The atomic half of coupon usage (docs/03 §11): one conditional UPDATE
 * that only succeeds if the coupon hasn't hit `maxUses` *right now*,
 * closing the race a read-then-write (validate.ts's preview, followed by
 * a plain UPDATE) would leave open between two checkouts racing for the
 * last use of a limited coupon. Must run inside the caller's order-creation
 * transaction (Phase 6) so a later failure (e.g. out of stock) rolls this
 * back too — mirrors inventory/service.ts's reserveStock exactly.
 */
export async function redeemCoupon(tx: Tx, input: RedeemCouponInput): Promise<void> {
  const updated = await tx
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(coupons.id, input.couponId),
        or(isNull(coupons.maxUses), lt(coupons.usedCount, coupons.maxUses)),
      ),
    )
    .returning({ id: coupons.id });

  if (updated.length === 0) {
    throw new CouponExhaustedError(input.code);
  }

  await tx.insert(couponRedemptions).values({
    couponId: input.couponId,
    userId: input.userId,
    orderId: input.orderId,
    amountPaise: input.amountPaise,
  });
}

/**
 * Undoes `redeemCoupon` when its order is cancelled (docs/06 §10: "coupon
 * usage returned"). Deletes the `coupon_redemptions` row too, not just the
 * counter — otherwise a per-user-limited coupon would stay blocked for a
 * customer whose order never actually went through. A no-op (not an error)
 * if no redemption exists for this order — cancelling a coupon-less order,
 * or double-cancelling, must stay safe to call.
 */
export async function releaseCoupon(tx: Tx, orderId: string): Promise<void> {
  const [redemption] = await tx
    .delete(couponRedemptions)
    .where(eq(couponRedemptions.orderId, orderId))
    .returning({ couponId: couponRedemptions.couponId });

  if (!redemption) return;

  await tx
    .update(coupons)
    .set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)`, updatedAt: new Date() })
    .where(eq(coupons.id, redemption.couponId));
}

import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { couponRedemptions, coupons } from "@/server/db/schema";
import { computeCouponDiscount } from "./discount";
import { couponCodeSchema } from "./schemas";

export type CouponValidationFailureCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MIN_SUBTOTAL_NOT_MET"
  | "USES_EXHAUSTED"
  | "PER_USER_LIMIT_REACHED"
  | "SIGN_IN_REQUIRED";

export type CouponValidationResult =
  | { ok: true; couponId: string; code: string; discountPaise: number }
  | { ok: false; code: CouponValidationFailureCode; message: string };

function fail(code: CouponValidationFailureCode, message: string): CouponValidationResult {
  return { ok: false, code, message };
}

export interface ValidateCouponContext {
  /** Required only when the coupon has a perUserLimit - site-wide there's no guest checkout, so a coupon preview without a signed-in user can't check it. */
  userId?: string;
  subtotalPaise: number;
}

/**
 * A read-only, non-atomic eligibility check - used for the checkout page's
 * live coupon preview (docs/06 §9 step 1: "server-validated preview
 * only"). It never throws for an ordinary invalid-coupon case, only for a
 * caller bug; and it never mutates `usedCount` - that's the atomic,
 * race-safe job of coupons/service.ts's `redeemCoupon`, called at actual
 * order creation (Phase 6), which re-validates everything itself.
 */
export async function validateCoupon(
  rawCode: string,
  context: ValidateCouponContext,
  dbHandle: DbOrTx = db,
  now: Date = new Date(),
): Promise<CouponValidationResult> {
  const code = couponCodeSchema.parse(rawCode);

  const coupon = await dbHandle.query.coupons.findFirst({ where: eq(coupons.code, code) });
  if (!coupon) return fail("NOT_FOUND", `No coupon found for code ${code}`);
  if (!coupon.isActive) return fail("INACTIVE", `Coupon ${code} is no longer active`);
  if (coupon.startsAt && now < coupon.startsAt)
    return fail("NOT_STARTED", `Coupon ${code} isn't active yet`);
  if (coupon.endsAt && now > coupon.endsAt) return fail("EXPIRED", `Coupon ${code} has expired`);
  if (context.subtotalPaise < coupon.minSubtotalPaise) {
    return fail("MIN_SUBTOTAL_NOT_MET", `Coupon ${code} requires a higher order subtotal`);
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return fail("USES_EXHAUSTED", `Coupon ${code} has reached its usage limit`);
  }

  if (coupon.perUserLimit !== null) {
    if (!context.userId) {
      return fail("SIGN_IN_REQUIRED", `Sign in to use coupon ${code}`);
    }
    const [{ value: redemptionCount }] = await dbHandle
      .select({ value: count() })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, coupon.id),
          eq(couponRedemptions.userId, context.userId),
        ),
      );
    if (redemptionCount >= coupon.perUserLimit) {
      return fail(
        "PER_USER_LIMIT_REACHED",
        `You've already used coupon ${code} the maximum number of times`,
      );
    }
  }

  const discountPaise = computeCouponDiscount(coupon, context.subtotalPaise);
  return { ok: true, couponId: coupon.id, code: coupon.code, discountPaise };
}

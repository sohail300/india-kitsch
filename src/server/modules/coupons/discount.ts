import { assertPaise, percentOfPaise } from "@/server/lib/money";

/** The subset of a coupon row needed to compute its discount amount - no DB access, pure math. */
export interface DiscountableCoupon {
  type: "percent" | "fixed";
  valueBps: number | null;
  valuePaise: number | null;
  maxDiscountPaise: number | null;
}

/**
 * The raw discount for a coupon already known to be eligible (docs/03 §4
 * fields) - never more than the subtotal, so a total can never go negative.
 * Eligibility (active, date window, min subtotal, usage limits) is
 * validate.ts's job, not this function's.
 */
export function computeCouponDiscount(coupon: DiscountableCoupon, subtotalPaise: number): number {
  assertPaise(subtotalPaise, "subtotalPaise");

  let raw: number;
  if (coupon.type === "percent") {
    if (coupon.valueBps === null) {
      throw new Error("computeCouponDiscount: percent coupon has no valueBps");
    }
    raw = percentOfPaise(subtotalPaise, coupon.valueBps);
  } else {
    if (coupon.valuePaise === null) {
      throw new Error("computeCouponDiscount: fixed coupon has no valuePaise");
    }
    raw = coupon.valuePaise;
  }

  if (coupon.maxDiscountPaise !== null) {
    raw = Math.min(raw, coupon.maxDiscountPaise);
  }

  return Math.min(raw, subtotalPaise);
}

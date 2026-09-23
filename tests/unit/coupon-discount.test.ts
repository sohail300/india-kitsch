import { describe, expect, it } from "vitest";
import { computeCouponDiscount } from "@/server/modules/coupons/discount";
import type { DiscountableCoupon } from "@/server/modules/coupons/discount";

describe("computeCouponDiscount", () => {
  it("computes a percent discount", () => {
    const coupon: DiscountableCoupon = {
      type: "percent",
      valueBps: 1000,
      valuePaise: null,
      maxDiscountPaise: null,
    };
    expect(computeCouponDiscount(coupon, 100000)).toBe(10000); // 10%
  });

  it("caps a percent discount at maxDiscountPaise", () => {
    const coupon: DiscountableCoupon = {
      type: "percent",
      valueBps: 5000, // 50%
      valuePaise: null,
      maxDiscountPaise: 20000,
    };
    expect(computeCouponDiscount(coupon, 100000)).toBe(20000); // would be 50000 uncapped
  });

  it("computes a fixed discount", () => {
    const coupon: DiscountableCoupon = {
      type: "fixed",
      valueBps: null,
      valuePaise: 15000,
      maxDiscountPaise: null,
    };
    expect(computeCouponDiscount(coupon, 100000)).toBe(15000);
  });

  it("never discounts more than the subtotal, even a large fixed coupon", () => {
    const coupon: DiscountableCoupon = {
      type: "fixed",
      valueBps: null,
      valuePaise: 999999,
      maxDiscountPaise: null,
    };
    expect(computeCouponDiscount(coupon, 5000)).toBe(5000);
  });

  it("throws for a percent coupon with no valueBps (a data bug, not a user error)", () => {
    const coupon: DiscountableCoupon = {
      type: "percent",
      valueBps: null,
      valuePaise: null,
      maxDiscountPaise: null,
    };
    expect(() => computeCouponDiscount(coupon, 100000)).toThrow();
  });

  it("throws for a fixed coupon with no valuePaise", () => {
    const coupon: DiscountableCoupon = {
      type: "fixed",
      valueBps: null,
      valuePaise: null,
      maxDiscountPaise: null,
    };
    expect(() => computeCouponDiscount(coupon, 100000)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { computeQuote } from "@/server/lib/pricing";
import type { PricingLine, ShippingSettings } from "@/server/lib/pricing";

const shipping: ShippingSettings = { feePaise: 9900, freeThresholdPaise: 299900 };

function line(overrides: Partial<PricingLine> = {}): PricingLine {
  return { variantId: "v1", unitPricePaise: 100000, quantity: 1, gstRateBps: 1200, ...overrides };
}

describe("computeQuote", () => {
  it("computes subtotal, GST-inclusive tax, and total with no discount", () => {
    const result = computeQuote({ lines: [line()], shipping });
    expect(result.subtotalPaise).toBe(100000);
    expect(result.discountPaise).toBe(0);
    // 100000 inclusive of 12% GST -> base 89286, gst 10714 (rounded)
    expect(result.taxIncludedPaise).toBe(10714);
    expect(result.shippingPaise).toBe(9900); // below the free threshold
    expect(result.totalPaise).toBe(100000 + 9900);
  });

  it("waives shipping at/above the free threshold (post-discount subtotal)", () => {
    const atThreshold = computeQuote({
      lines: [line({ unitPricePaise: 299900 })],
      shipping,
    });
    expect(atThreshold.shippingPaise).toBe(0);

    const justBelow = computeQuote({
      lines: [line({ unitPricePaise: 299800 })],
      shipping,
    });
    expect(justBelow.shippingPaise).toBe(9900);
  });

  it("a coupon that drops the net subtotal below the free threshold makes shipping chargeable again", () => {
    const result = computeQuote({
      lines: [line({ unitPricePaise: 300000 })], // above threshold before discount
      discountPaise: 10000, // net = 290000, below the 299900 threshold
      shipping,
    });
    expect(result.shippingPaise).toBe(9900);
  });

  it("allocates a discount across multiple lines proportionally, summing to exactly discountPaise", () => {
    const result = computeQuote({
      lines: [
        line({ variantId: "a", unitPricePaise: 33333, quantity: 1 }), // subtotal 33333
        line({ variantId: "b", unitPricePaise: 66667, quantity: 1 }), // subtotal 66667
      ],
      discountPaise: 10000,
      shipping,
    });
    const totalAllocated = result.lines.reduce((sum, l) => sum + l.lineDiscountPaise, 0);
    expect(totalAllocated).toBe(10000); // no rounding leakage
    // Larger line gets the larger (or equal, absorbing the remainder) share.
    const [lineA, lineB] = result.lines;
    expect(lineB!.lineDiscountPaise).toBeGreaterThanOrEqual(lineA!.lineDiscountPaise);
  });

  it("the last line absorbs the discount-allocation rounding remainder", () => {
    // 3 equal lines splitting a discount that doesn't divide evenly by 3.
    const result = computeQuote({
      lines: [
        line({ variantId: "a", unitPricePaise: 10000 }),
        line({ variantId: "b", unitPricePaise: 10000 }),
        line({ variantId: "c", unitPricePaise: 10000 }),
      ],
      discountPaise: 100, // 100/3 = 33.33...
      shipping,
    });
    expect(result.lines.map((l) => l.lineDiscountPaise)).toEqual([33, 33, 34]);
    expect(result.discountPaise).toBe(100);
  });

  it("computes GST on the post-discount line amount, not the original", () => {
    const result = computeQuote({
      lines: [line({ unitPricePaise: 100000, gstRateBps: 1200 })],
      discountPaise: 50000,
      shipping,
    });
    const discountedLine = result.lines[0]!;
    expect(discountedLine.lineTotalPaise).toBe(50000);
    // splitGstInclusive(50000, 1200) -> base 44643, gst 5357
    expect(discountedLine.lineGstPaise).toBe(5357);
    expect(result.taxIncludedPaise).toBe(5357);
  });

  it("rejects a discount greater than the subtotal", () => {
    expect(() =>
      computeQuote({ lines: [line({ unitPricePaise: 1000 })], discountPaise: 1001, shipping }),
    ).toThrow();
  });

  it("rejects a negative discount", () => {
    expect(() => computeQuote({ lines: [line()], discountPaise: -1, shipping })).toThrow();
  });

  it("rejects an empty line list", () => {
    expect(() => computeQuote({ lines: [], shipping })).toThrow();
  });

  it("rejects a non-positive quantity", () => {
    expect(() => computeQuote({ lines: [line({ quantity: 0 })], shipping })).toThrow();
  });

  it("sums correctly across many lines with mixed quantities", () => {
    const result = computeQuote({
      lines: [
        line({ variantId: "a", unitPricePaise: 25000, quantity: 2 }), // 50000
        line({ variantId: "b", unitPricePaise: 40000, quantity: 3 }), // 120000
      ],
      shipping,
    });
    expect(result.subtotalPaise).toBe(170000);
    expect(result.totalPaise).toBe(170000 + 9900); // below the free threshold
  });
});

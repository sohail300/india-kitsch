import { describe, expect, it } from "vitest";
import {
  assertPaise,
  formatINR,
  isValidPaise,
  percentOfPaise,
  splitGstInclusive,
  sumPaise,
  toPaise,
  toRupees,
} from "@/server/lib/money";

describe("toPaise", () => {
  it("converts a whole-rupee amount", () => {
    expect(toPaise(199)).toBe(19900);
  });

  it("converts a fractional-rupee amount, rounding to the nearest paisa", () => {
    expect(toPaise(19.99)).toBe(1999);
  });

  it("rejects a negative amount", () => {
    expect(() => toPaise(-1)).toThrow();
  });
});

describe("toRupees", () => {
  it("converts paise back to rupees", () => {
    expect(toRupees(19900)).toBe(199);
    expect(toRupees(1999)).toBeCloseTo(19.99, 5);
  });
});

describe("isValidPaise / assertPaise", () => {
  it("accepts a non-negative integer", () => {
    expect(isValidPaise(0)).toBe(true);
    expect(isValidPaise(10)).toBe(true);
    expect(() => assertPaise(10)).not.toThrow();
  });

  it("rejects a non-integer", () => {
    expect(isValidPaise(10.5)).toBe(false);
    expect(() => assertPaise(10.5)).toThrow();
  });

  it("rejects a negative value", () => {
    expect(isValidPaise(-1)).toBe(false);
    expect(() => assertPaise(-1)).toThrow();
  });

  it("rejects a value beyond the Postgres integer column max", () => {
    expect(isValidPaise(2_147_483_648)).toBe(false);
  });
});

describe("formatINR", () => {
  it("formats paise as an INR currency string", () => {
    expect(formatINR(150000)).toBe("₹1,500.00");
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });
});

describe("sumPaise", () => {
  it("sums a list of paise amounts", () => {
    expect(sumPaise([100, 200, 300])).toBe(600);
  });

  it("sums an empty list to zero", () => {
    expect(sumPaise([])).toBe(0);
  });

  it("throws if any amount is invalid", () => {
    expect(() => sumPaise([100, -50])).toThrow();
  });
});

describe("percentOfPaise", () => {
  it("computes a percentage given in basis points", () => {
    // 5% (500 bps) of ₹100 (10000 paise) = ₹5 (500 paise)
    expect(percentOfPaise(10_000, 500)).toBe(500);
  });

  it("rounds to the nearest paisa", () => {
    // 33.33% of ₹1 (100 paise) = 33.33 paise, rounds to 33
    expect(percentOfPaise(100, 3333)).toBe(33);
  });
});

describe("splitGstInclusive", () => {
  it("splits a GST-inclusive price into base + GST at 18%", () => {
    // ₹118 inclusive of 18% GST = ₹100 base + ₹18 GST
    const { basePaise, gstPaise } = splitGstInclusive(11_800, 1800);
    expect(basePaise).toBe(10_000);
    expect(gstPaise).toBe(1_800);
  });

  it("base + GST always reconstitutes the original total", () => {
    const total = 12_345;
    const { basePaise, gstPaise } = splitGstInclusive(total, 500);
    expect(basePaise + gstPaise).toBe(total);
  });

  it("returns zero GST at a 0% rate", () => {
    const { basePaise, gstPaise } = splitGstInclusive(10_000, 0);
    expect(basePaise).toBe(10_000);
    expect(gstPaise).toBe(0);
  });
});

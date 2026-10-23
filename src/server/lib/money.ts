import "server-only";

/**
 * All money in this codebase is an integer number of paise (1 rupee = 100
 * paise) - never a float. See docs/01 §1 ("Money = integer paise, never
 * floats") and docs/03 §4 (columns are `integer`, max ~₹2.1 crore/value).
 *
 * This module is the one place that knows how to move between "paise" (the
 * only form allowed in the database and in business logic) and "rupees"
 * (only ever used at the UI edge, for input/display).
 */

const MAX_SAFE_PAISE = 2_147_483_647; // Postgres `integer` column max, see docs/03 §4

export function isValidPaise(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_SAFE_PAISE
  );
}

/** Throws if `value` isn't a non-negative integer paise amount within column bounds. */
export function assertPaise(value: number, label = "amount"): asserts value is number {
  if (!isValidPaise(value)) {
    throw new Error(`${label} must be a non-negative integer number of paise, got ${value}`);
  }
}

/** Converts a rupee amount (e.g. user input, a catalog price authored in rupees) to paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`rupees must be a non-negative finite number, got ${rupees}`);
  }
  return Math.round(rupees * 100);
}

/** Converts paise to a rupee float - for calculations only, never store the result. */
export function toRupees(paise: number): number {
  assertPaise(paise);
  return paise / 100;
}

/** Formats paise as an INR currency string, e.g. `formatINR(19900)` → "₹199.00". */
export function formatINR(paise: number): string {
  assertPaise(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

/** Sums a list of paise amounts, validating each one. */
export function sumPaise(amounts: number[]): number {
  return amounts.reduce((total, amount) => {
    assertPaise(amount);
    return total + amount;
  }, 0);
}

/**
 * Applies a rate given in basis points (1 bps = 0.01%) to a paise amount,
 * rounding to the nearest paisa. Used for GST rates (`gstRateBps`) and
 * percent coupons (`valueBps`) - see docs/03 §4.
 */
export function percentOfPaise(amountPaise: number, bps: number): number {
  assertPaise(amountPaise);
  if (!Number.isInteger(bps) || bps < 0) {
    throw new Error(`bps must be a non-negative integer, got ${bps}`);
  }
  return Math.round((amountPaise * bps) / 10_000);
}

/**
 * Splits a GST-inclusive price into its base and GST components.
 * e.g. splitGstInclusive(11800, 1800) → { basePaise: 10000, gstPaise: 1800 }
 * (₹118 inclusive of 18% GST = ₹100 base + ₹18 GST).
 */
export function splitGstInclusive(
  totalPaise: number,
  gstRateBps: number,
): { basePaise: number; gstPaise: number } {
  assertPaise(totalPaise);
  if (!Number.isInteger(gstRateBps) || gstRateBps < 0) {
    throw new Error(`gstRateBps must be a non-negative integer, got ${gstRateBps}`);
  }
  const basePaise = Math.round((totalPaise * 10_000) / (10_000 + gstRateBps));
  return { basePaise, gstPaise: totalPaise - basePaise };
}

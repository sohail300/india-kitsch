import "server-only";
import { assertPaise, splitGstInclusive, sumPaise } from "./money";

/**
 * The one place order totals are computed (docs/06 §9 step 2: "all in
 * integer paise with deterministic rounding, in one pricing.ts used
 * everywhere") - used by `quoteCart` now and by `createOrder` in Phase 6, so
 * a cart preview and the order it becomes can never silently disagree.
 * Pure and DB-free: callers resolve prices/availability first.
 */

export interface PricingLine {
  variantId: string;
  /** The variant's own price if set, else the product's - never the raw catalog row. */
  unitPricePaise: number;
  quantity: number;
  gstRateBps: number;
}

export interface PricedLine extends PricingLine {
  lineSubtotalPaise: number;
  lineDiscountPaise: number;
  lineTotalPaise: number;
  /** Informational only - already included in lineTotalPaise, never added on top (docs/03 §4: GST-inclusive pricing). */
  lineGstPaise: number;
}

export interface ShippingSettings {
  feePaise: number;
  /** null = never free, regardless of subtotal. */
  freeThresholdPaise: number | null;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  /** Informational GST component of the total - already included in totalPaise, never added on top. */
  taxIncludedPaise: number;
  totalPaise: number;
}

/**
 * Splits a total discount across lines proportionally to each line's share
 * of the subtotal, flooring every share except the last line, which
 * absorbs the rounding remainder - guarantees the parts sum to exactly
 * `discountPaise`, never a paisa more or less (docs/09 §20: "coupon
 * allocation" is an explicit rounding case to get right).
 */
function allocateDiscount(
  lines: PricingLine[],
  subtotalPaise: number,
  discountPaise: number,
): number[] {
  if (discountPaise === 0 || subtotalPaise === 0) {
    return lines.map(() => 0);
  }

  const allocations: number[] = [];
  let allocated = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineSubtotal = line.unitPricePaise * line.quantity;
    if (i === lines.length - 1) {
      allocations.push(discountPaise - allocated);
    } else {
      const share = Math.floor((discountPaise * lineSubtotal) / subtotalPaise);
      allocations.push(share);
      allocated += share;
    }
  }
  return allocations;
}

/**
 * Free shipping is compared against the *post-discount* subtotal (net
 * merchandise value) - a coupon that drops a cart below the free-shipping
 * threshold should make shipping chargeable again, not leave it free on a
 * pre-discount number the customer no longer actually spent.
 */
function computeShipping(netSubtotalPaise: number, settings: ShippingSettings): number {
  if (settings.freeThresholdPaise !== null && netSubtotalPaise >= settings.freeThresholdPaise) {
    return 0;
  }
  return settings.feePaise;
}

export interface ComputeQuoteInput {
  lines: PricingLine[];
  /** Total discount already decided (e.g. by coupons/validate.ts) - pricing.ts only allocates and applies it, never decides eligibility or amount. */
  discountPaise?: number;
  shipping: ShippingSettings;
}

export function computeQuote(input: ComputeQuoteInput): PricingResult {
  if (input.lines.length === 0) {
    throw new Error("computeQuote: at least one line is required");
  }

  for (const line of input.lines) {
    assertPaise(line.unitPricePaise, `unitPricePaise for variant ${line.variantId}`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(
        `computeQuote: quantity must be a positive integer, got ${line.quantity} for variant ${line.variantId}`,
      );
    }
  }

  const subtotalPaise = sumPaise(input.lines.map((l) => l.unitPricePaise * l.quantity));
  const discountPaise = input.discountPaise ?? 0;
  if (discountPaise < 0 || discountPaise > subtotalPaise) {
    throw new Error(
      `computeQuote: discountPaise (${discountPaise}) must be between 0 and the subtotal (${subtotalPaise})`,
    );
  }

  const discountAllocations = allocateDiscount(input.lines, subtotalPaise, discountPaise);

  const lines: PricedLine[] = input.lines.map((line, i) => {
    const lineSubtotalPaise = line.unitPricePaise * line.quantity;
    const lineDiscountPaise = discountAllocations[i]!;
    const lineTotalPaise = lineSubtotalPaise - lineDiscountPaise;
    // Tax on the post-discount line amount - a discounted line has a
    // proportionally smaller GST-inclusive tax component, not the original.
    const { gstPaise: lineGstPaise } = splitGstInclusive(lineTotalPaise, line.gstRateBps);
    return { ...line, lineSubtotalPaise, lineDiscountPaise, lineTotalPaise, lineGstPaise };
  });

  const netSubtotalPaise = subtotalPaise - discountPaise;
  const shippingPaise = computeShipping(netSubtotalPaise, input.shipping);
  const taxIncludedPaise = sumPaise(lines.map((l) => l.lineGstPaise));
  const totalPaise = netSubtotalPaise + shippingPaise;

  return { lines, subtotalPaise, discountPaise, shippingPaise, taxIncludedPaise, totalPaise };
}

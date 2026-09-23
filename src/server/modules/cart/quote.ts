import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { productVariants } from "@/server/db/schema";
import { computeQuote } from "@/server/lib/pricing";
import type { PricedLine } from "@/server/lib/pricing";
import { getAvailability } from "@/server/modules/inventory/queries";
import { getShippingSettings } from "@/server/modules/settings/queries";
import { validateCoupon } from "@/server/modules/coupons/validate";
import type { CouponValidationResult } from "@/server/modules/coupons/validate";

/** Cart lines only ever carry `{variantId, qty}` client-side (docs/05 §8) — quoteCart resolves everything else fresh, every time. */
export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export const CART_LINE_QUANTITY_CAP = 10;

export type QuotedLineStatus =
  | "ok"
  | "quantity_clamped" // requested more than the per-line cap
  | "quantity_reduced_for_stock" // requested more than what's available
  | "unavailable" // resolvable but nothing in stock right now
  | "unpurchasable"; // archived variant or non-active product

export interface QuotedLine {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  size: string;
  color: string;
  imageKey: string | null;
  unitPricePaise: number;
  mrpPaise: number | null;
  gstRateBps: number;
  requestedQuantity: number;
  quantity: number;
  available: number;
  status: QuotedLineStatus;
  /** false for unavailable/unpurchasable lines — excluded from subtotal/total, still shown so the UI can prompt removal. */
  includedInTotals: boolean;
  lineSubtotalPaise: number;
  lineDiscountPaise: number;
  lineTotalPaise: number;
  lineGstPaise: number;
}

export interface RemovedLine {
  variantId: string;
  reason: "not_found";
}

export interface QuoteCartResult {
  lines: QuotedLine[];
  removedLines: RemovedLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxIncludedPaise: number;
  totalPaise: number;
  coupon: CouponValidationResult | null;
}

export interface QuoteCartOptions {
  userId?: string;
  couponCode?: string;
}

function resolveImageKey(variant: {
  images: { r2Key: string; isPrimary: boolean }[];
  product: { images: { r2Key: string; variantId: string | null; isPrimary: boolean }[] };
}): string | null {
  const variantPrimary = variant.images.find((i) => i.isPrimary);
  if (variantPrimary) return variantPrimary.r2Key;
  const productPrimary = variant.product.images.find((i) => i.variantId === null && i.isPrimary);
  if (productPrimary) return productPrimary.r2Key;
  const anyProductImage = variant.product.images.find((i) => i.variantId === null);
  return anyProductImage?.r2Key ?? variant.images[0]?.r2Key ?? null;
}

/**
 * The advisory cart quote (docs/05 §8): authoritative name/price/image/
 * availability/totals for whatever the client's localStorage cart claims to
 * hold. Never throws for cart-shaped problems (missing/archived/out-of-
 * stock items) — it flags and clamps instead; `createOrder` (Phase 6)
 * re-validates and re-computes everything from scratch, this is advisory
 * only (docs/05 §8: "the quote is advisory").
 */
export async function quoteCart(
  rawLines: CartLineInput[],
  options: QuoteCartOptions = {},
  dbHandle: DbOrTx = db,
): Promise<QuoteCartResult> {
  // Merge duplicate variantIds (a data-normalization concern the UI shouldn't have to avoid).
  const merged = new Map<string, number>();
  for (const line of rawLines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  const variantIds = [...merged.keys()];

  if (variantIds.length === 0) {
    return {
      lines: [],
      removedLines: [],
      subtotalPaise: 0,
      discountPaise: 0,
      shippingPaise: 0,
      taxIncludedPaise: 0,
      totalPaise: 0,
      coupon: null,
    };
  }

  const [variants, availability, shipping] = await Promise.all([
    dbHandle.query.productVariants.findMany({
      where: inArray(productVariants.id, variantIds),
      with: {
        images: true,
        product: { with: { images: true } },
      },
    }),
    getAvailability(variantIds, dbHandle),
    getShippingSettings(dbHandle),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const removedLines: RemovedLine[] = [];
  const lines: QuotedLine[] = [];

  for (const [variantId, requestedQuantity] of merged) {
    const variant = variantById.get(variantId);
    if (!variant) {
      removedLines.push({ variantId, reason: "not_found" });
      continue;
    }

    const stock = availability.get(variantId);
    const available = stock?.available ?? 0;
    const unpurchasable = !variant.isActive || variant.product.status !== "active";

    let quantity = requestedQuantity;
    let status: QuotedLineStatus = "ok";

    if (unpurchasable) {
      status = "unpurchasable";
      quantity = 0;
    } else if (available <= 0) {
      status = "unavailable";
      quantity = 0;
    } else {
      if (quantity > CART_LINE_QUANTITY_CAP) {
        quantity = CART_LINE_QUANTITY_CAP;
        status = "quantity_clamped";
      }
      if (quantity > available) {
        quantity = available;
        status = "quantity_reduced_for_stock";
      }
    }

    const unitPricePaise = variant.pricePaise ?? variant.product.pricePaise;
    const mrpPaise = variant.mrpPaise ?? variant.product.mrpPaise;
    const includedInTotals = quantity > 0;

    lines.push({
      variantId,
      productId: variant.product.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      size: variant.size,
      color: variant.color,
      imageKey: resolveImageKey(variant),
      unitPricePaise,
      mrpPaise,
      gstRateBps: variant.product.gstRateBps,
      requestedQuantity,
      quantity,
      available,
      status,
      includedInTotals,
      // Filled in below once the coupon (and so the discount) is known.
      lineSubtotalPaise: unitPricePaise * quantity,
      lineDiscountPaise: 0,
      lineTotalPaise: unitPricePaise * quantity,
      lineGstPaise: 0,
    });
  }

  const purchasableLines = lines.filter((l) => l.includedInTotals);

  if (purchasableLines.length === 0) {
    return {
      lines,
      removedLines,
      subtotalPaise: 0,
      discountPaise: 0,
      shippingPaise: 0,
      taxIncludedPaise: 0,
      totalPaise: 0,
      coupon: null,
    };
  }

  const preDiscountSubtotal = purchasableLines.reduce((sum, l) => sum + l.lineSubtotalPaise, 0);

  let coupon: CouponValidationResult | null = null;
  if (options.couponCode) {
    coupon = await validateCoupon(
      options.couponCode,
      { userId: options.userId, subtotalPaise: preDiscountSubtotal },
      dbHandle,
    );
  }

  const priced = computeQuote({
    lines: purchasableLines.map((l) => ({
      variantId: l.variantId,
      unitPricePaise: l.unitPricePaise,
      quantity: l.quantity,
      gstRateBps: l.gstRateBps,
    })),
    discountPaise: coupon?.ok ? coupon.discountPaise : 0,
    shipping,
  });

  const pricedByVariantId = new Map<string, PricedLine>(priced.lines.map((l) => [l.variantId, l]));
  for (const line of lines) {
    const p = pricedByVariantId.get(line.variantId);
    if (!p) continue;
    line.lineSubtotalPaise = p.lineSubtotalPaise;
    line.lineDiscountPaise = p.lineDiscountPaise;
    line.lineTotalPaise = p.lineTotalPaise;
    line.lineGstPaise = p.lineGstPaise;
  }

  return {
    lines,
    removedLines,
    subtotalPaise: priced.subtotalPaise,
    discountPaise: priced.discountPaise,
    shippingPaise: priced.shippingPaise,
    taxIncludedPaise: priced.taxIncludedPaise,
    totalPaise: priced.totalPaise,
    coupon,
  };
}

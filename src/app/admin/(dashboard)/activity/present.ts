import { ORDER_STATUS_LABEL } from "@/app/admin/_components/status-badge";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { formatINR } from "@/app/admin/_lib/money-client";

/**
 * Turns `audit_log` rows into plain wording for the Activity log: an action
 * label, a one-line summary for the table and a field-by-field change list
 * for the details dialog. Pure (no DB), so it's unit-tested directly.
 * Anything it doesn't recognise falls back to the raw names and values,
 * so a new kind of change never breaks the page.
 */

const ACTION_LABELS: Record<string, string> = {
  "order.markProcessing": "Marked processing",
  "order.markShipped": "Marked shipped",
  "order.markDelivered": "Marked delivered",
  "order.setNote": "Edited order note",
  "order.refund": "Issued refund",
  "order.cancelPaid": "Cancelled order",
  "product.create": "Created product",
  "product.update": "Edited product",
  "product.delete": "Deleted product",
  "product.generateVariantMatrix": "Added sizes & colours",
  "product.updateVariant": "Edited size & colour",
  "product.deleteVariant": "Deleted size & colour",
  "product.uploadImage": "Added photo",
  "product.updateImageAlt": "Edited photo description",
  "product.reorderImages": "Reordered photos",
  "inventory.adjust": "Adjusted stock",
  "category.create": "Created category",
  "category.update": "Edited category",
  "category.activate": "Showed category",
  "category.deactivate": "Hid category",
  "category.delete": "Deleted category",
  "category.reorder": "Reordered categories",
  "coupon.create": "Created coupon",
  "coupon.update": "Edited coupon",
  "customer.disable": "Disabled customer",
  "customer.enable": "Re-enabled customer",
  "settings.update": "Changed settings",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  slug: "URL slug",
  description: "Description",
  imageKey: "Image",
  sortOrder: "Position",
  isActive: "Active",
  categoryId: "Category",
  sizeChartId: "Size chart",
  pricePaise: "Price",
  mrpPaise: "Original price",
  gstRateBps: "GST rate",
  hsnCode: "HSN code",
  status: "Status",
  isFeatured: "Featured",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  publishedAt: "Published",
  sku: "SKU",
  size: "Size",
  color: "Colour",
  colorHex: "Colour swatch",
  weightGrams: "Weight (g)",
  alt: "Photo description",
  isPrimary: "Main photo",
  code: "Code",
  type: "Type",
  valueBps: "Discount (%)",
  valuePaise: "Discount (₹)",
  minSubtotalPaise: "Minimum order",
  maxDiscountPaise: "Max discount",
  startsAt: "Starts",
  endsAt: "Ends",
  maxUses: "Total uses allowed",
  perUserLimit: "Uses per customer",
  usedCount: "Times used",
  disabled: "Disabled",
  adminNote: "Note",
  courier: "Courier",
  trackingNumber: "Tracking number",
  amountPaise: "Amount",
  refundedAmountPaise: "Refunded",
  razorpayRefundId: "Razorpay refund ID",
  fullRefund: "Full refund",
  reason: "Reason",
  delta: "Change",
  newOnHand: "In hand after",
  note: "Note",
  feePaise: "Shipping fee",
  freeThresholdPaise: "Free shipping from",
  gstin: "GSTIN",
  sellerState: "Seller state",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  addressCity: "City",
  addressPincode: "PIN code",
  instagramUrl: "Instagram",
  facebookUrl: "Facebook",
  defaultGstRateBps: "Default GST rate",
  lowStockThreshold: "Low stock at",
  orderedCategoryIds: "Order",
  imageIdsInOrder: "Order",
  created: "Added",
  skipped: "Already existed",
  startingStock: "Starting stock",
};

// Where the same column means something more specific for one kind of item.
const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  category: { isActive: "Visible" },
  product_variant: { isActive: "Selling" },
};

// Bookkeeping columns that change on every save and say nothing to the owner.
const HIDDEN_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdByAdminId",
  "productId",
  "variantId",
  "r2Key",
  "width",
  "height",
]);

const STOCK_REASON_LABELS: Record<string, string> = {
  adjustment: "Manual adjustment",
  restock: "Restock",
  return: "Returned",
};

const COUPON_TYPE_LABELS: Record<string, string> = {
  percent: "Percent off",
  fixed: "Amount off",
};

export interface ActivityContext {
  categoryNames: Map<string, string>;
}

function fieldLabel(entityType: string, key: string): string {
  return (
    ENTITY_FIELD_LABELS[entityType]?.[key] ??
    FIELD_LABELS[key] ??
    // "minSubtotal" → "Min subtotal"
    key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function formatValue(key: string, value: unknown, ctx: ActivityContext): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.endsWith("Paise")) return formatINR(value);
    if (key.endsWith("Bps")) return `${value / 100}%`;
    if (key === "delta") return value > 0 ? `+${value}` : String(value);
    return String(value);
  }
  if (typeof value === "string") {
    if (key.endsWith("At")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatAdminDateTime(date);
    }
    if (key === "status") {
      return ORDER_STATUS_LABEL[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
    }
    if (key === "categoryId") return ctx.categoryNames.get(value) ?? "Deleted category";
    if (key === "reason") return STOCK_REASON_LABELS[value] ?? value;
    if (key === "type") return COUPON_TYPE_LABELS[value] ?? value;
    return value;
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  return JSON.stringify(value);
}

export interface ActivityChange {
  label: string;
  /** `null` when the change has no "before" side (e.g. something created). */
  before: string | null;
  after: string | null;
}

function asRecord(snapshot: unknown): Record<string, unknown> | null {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : null;
}

/**
 * Field-by-field changes. With both sides, only fields that differ; with
 * one side (a create or a delete), every field on it.
 */
export function describeChanges(
  entityType: string,
  before: unknown,
  after: unknown,
  ctx: ActivityContext,
): ActivityChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].filter(
    (k) => !HIDDEN_FIELDS.has(k),
  );
  const changes: ActivityChange[] = [];
  for (const key of keys) {
    if (b && a && JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
    changes.push({
      label: fieldLabel(entityType, key),
      before: b ? formatValue(key, b[key], ctx) : null,
      after: a ? formatValue(key, a[key], ctx) : null,
    });
  }
  return changes;
}

/** The table's one-line "Changes" text; empty when there's nothing worth saying. */
export function summarizeEntry(
  action: string,
  entityType: string,
  before: unknown,
  after: unknown,
  ctx: ActivityContext,
): string {
  const a = asRecord(after) ?? {};
  switch (action) {
    case "inventory.adjust": {
      // The note holds the reason picked in the Adjust stock dialog ("Damaged
      // or defective — …"); `reason` is only the broad movement type.
      const why =
        typeof a.note === "string" && a.note !== ""
          ? truncate(a.note, 40)
          : formatValue("reason", a.reason, ctx);
      const parts = [
        formatValue("delta", a.delta, ctx),
        why,
        `In hand ${formatValue("newOnHand", a.newOnHand, ctx)}`,
      ];
      return parts.join(" · ");
    }
    case "order.refund":
      return `${formatValue("amountPaise", a.amountPaise, ctx)} ${a.fullRefund ? "(full)" : "(partial)"}`;
    case "order.cancelPaid":
      return `Refunded ${formatValue("refundedAmountPaise", a.refundedAmountPaise, ctx)}`;
    case "order.markShipped":
      return `${formatValue("courier", a.courier, ctx)} · ${formatValue("trackingNumber", a.trackingNumber, ctx)}`;
    case "product.generateVariantMatrix": {
      const added = Array.isArray(a.created) ? a.created.length : 0;
      const skipped = Array.isArray(a.skipped) ? a.skipped.length : 0;
      return skipped > 0 ? `${added} added, ${skipped} already existed` : `${added} added`;
    }
    case "product.reorderImages":
    case "category.reorder":
      return "New order saved";
    case "customer.disable":
    case "customer.enable":
      return "";
  }
  // A create or delete: the item name in the Item column says it all.
  if (!asRecord(before) || !asRecord(after)) return "";

  const changes = describeChanges(entityType, before, after, ctx);
  if (changes.length === 0) return "Saved without changes";
  const shown = changes
    .slice(0, 2)
    .map((c) => `${c.label}: ${truncate(c.before ?? "—", 40)} → ${truncate(c.after ?? "—", 40)}`);
  const more = changes.length - shown.length;
  return more > 0 ? `${shown.join("; ")}; +${more} more` : shown.join("; ");
}

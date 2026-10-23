import { sql } from "drizzle-orm";
import { boolean, check, index, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { appSchema } from "./_shared";
import { user } from "./auth";
import { productVariants } from "./catalog";
import { createId } from "@/server/lib/ids";

/**
 * Commerce tables - docs/03 §4 "Commerce". Order lifecycle states match
 * docs/06 §10 exactly; the `orders.status` transition table there is the
 * only code allowed to change this column (docs/06 §10: "A single
 * `transition(order, to, actor)` function... No other code writes
 * `orders.status`").
 */

export const orderStatusEnum = appSchema.enum("order_status", [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const couponTypeEnum = appSchema.enum("coupon_type", ["percent", "fixed"]);

export const paymentStatusEnum = appSchema.enum("payment_status", [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);

export const addresses = appSchema.table(
  "addresses",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label"),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    // GST state code - see docs/06 §9 tax.ts for CGST+SGST vs IGST.
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("addresses_user_id_idx").on(table.userId),
    check("addresses_pincode_format", sql`${table.pincode} ~ '^[0-9]{6}$'`),
  ],
);

export const coupons = appSchema.table(
  "coupons",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    code: text("code").notNull().unique(),
    type: couponTypeEnum("type").notNull(),
    valueBps: integer("value_bps"),
    valuePaise: integer("value_paise"),
    minSubtotalPaise: integer("min_subtotal_paise").notNull().default(0),
    maxDiscountPaise: integer("max_discount_paise"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    perUserLimit: integer("per_user_limit"),
    isActive: boolean("is_active").notNull().default(true),
    // Nullable: coupons seeded outside the admin UI have no creator, and
    // `set null` keeps a coupon alive if its creating admin is ever removed.
    createdByAdminId: text("created_by_admin_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("coupons_code_uppercase", sql`${table.code} = upper(${table.code})`),
    // The application-level "conditional UPDATE" pattern (docs/03 §11)
    // is what actually prevents a race from exceeding maxUses; this CHECK
    // is the backstop that makes it impossible even if that code is wrong.
    check(
      "coupons_used_count_within_max",
      sql`${table.maxUses} is null or ${table.usedCount} <= ${table.maxUses}`,
    ),
  ],
);

export const couponRedemptions = appSchema.table("coupon_redemptions", {
  id: text("id").primaryKey().$defaultFn(createId),
  couponId: text("coupon_id")
    .notNull()
    .references(() => coupons.id, { onDelete: "restrict" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  orderId: text("order_id").notNull().unique(),
  amountPaise: integer("amount_paise").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Backs `orders.orderNumber` - displayed as `IK-1001` etc. (docs/03 §4).
export const orderNumberSeq = appSchema.sequence("order_number_seq", {
  startWith: 1001,
  increment: 1,
});

export const orders = appSchema.table(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderNumber: integer("order_number")
      .notNull()
      .unique()
      .default(sql`nextval('app.order_number_seq')`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    currency: text("currency").notNull().default("INR"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    taxIncludedPaise: integer("tax_included_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    couponCode: text("coupon_code"),

    // Shipping address snapshot (docs/03 §4) - never joined live to
    // `addresses`, so editing/deleting an address never changes history.
    shipFullName: text("ship_full_name").notNull(),
    shipPhone: text("ship_phone").notNull(),
    shipLine1: text("ship_line1").notNull(),
    shipLine2: text("ship_line2"),
    shipCity: text("ship_city").notNull(),
    shipState: text("ship_state").notNull(),
    shipPincode: text("ship_pincode").notNull(),

    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),

    razorpayOrderId: text("razorpay_order_id").unique(),
    idempotencyKey: text("idempotency_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    adminNote: text("admin_note"),

    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_user_id_created_idx").on(table.userId, table.createdAt),
    index("orders_status_created_idx").on(table.status, table.createdAt),
    index("orders_expires_at_idx").on(table.expiresAt),
    // "unique per user" (docs/03 §4), not globally unique.
    unique("orders_user_idempotency_key_key").on(table.userId, table.idempotencyKey),
  ],
);

export const orderItems = appSchema.table(
  "order_items",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // SET NULL, not cascade - a deleted/archived variant must never take
    // its order history down with it (docs/03 §4).
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),

    // Snapshots - order history never changes when the catalog does.
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    size: text("size").notNull(),
    color: text("color").notNull(),
    imageKey: text("image_key"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    mrpPaise: integer("mrp_paise"),
    quantity: integer("quantity").notNull(),
    gstRateBps: integer("gst_rate_bps").notNull(),
    hsnCode: text("hsn_code"),
    lineTotalPaise: integer("line_total_paise").notNull(),
    lineDiscountPaise: integer("line_discount_paise").notNull().default(0),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orderEvents = appSchema.table(
  "order_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    // Free-form per docs/03 §4: "system|customer|admin:<id>|razorpay".
    actor: text("actor").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_events_order_id_idx").on(table.orderId)],
);

export const payments = appSchema.table(
  "payments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("razorpay"),
    razorpayOrderId: text("razorpay_order_id").notNull(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    status: paymentStatusEnum("status").notNull().default("created"),
    amountPaise: integer("amount_paise").notNull(),
    method: text("method"),
    errorCode: text("error_code"),
    errorDescription: text("error_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payments_order_id_idx").on(table.orderId)],
);

export const refunds = appSchema.table(
  "refunds",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    razorpayRefundId: text("razorpay_refund_id").notNull().unique(),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason"),
    status: text("status").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("refunds_order_id_idx").on(table.orderId)],
);

// PK = the Razorpay event id itself - see docs/06 §9 step 5 (idempotency
// guard) and docs/03 §4 (rows older than 90 days pruned by the sweep job).
export const webhookEvents = appSchema.table("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  outcome: text("outcome"),
});

import { relations } from "drizzle-orm";
import { user } from "./auth";
import { productVariants } from "./catalog";
import {
  addresses,
  couponRedemptions,
  coupons,
  orderEvents,
  orderItems,
  orders,
  payments,
  refunds,
} from "./commerce";
import { inventory } from "./inventory";

/**
 * Cross-domain relations live here, not inline in commerce.ts/auth.ts/
 * inventory.ts — `user` (auth.ts) and `orders`/`addresses` (commerce.ts)
 * each need relations pointing at the other, and commerce.ts already
 * imports `user` from auth.ts, so defining `relations(user, ...)` there
 * too would need auth.ts to import back from commerce.ts, a real circular
 * module dependency. One central file that imports every table it needs
 * avoids that; catalog.ts's self-contained relations (Phase 4) didn't need
 * this since every table they reference already lives in that same file.
 */

export const userRelationsExt = relations(user, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(user, { fields: [addresses.userId], references: [user.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
  refunds: many(refunds),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  user: one(user, { fields: [couponRedemptions.userId], references: [user.id] }),
}));

/**
 * inventory.variantId is a 1:1 PK/FK onto productVariants — the admin
 * inventory grid queries *from* `inventory` (`db.query.inventory.findMany
 * ({ with: { variant: { with: { product: true } } } })`) to get that join
 * in one relational query. Deliberately not the reverse (a second
 * `relations(productVariants, ...)` here): Drizzle doesn't merge multiple
 * `relations()` calls for the same table across files — the later one
 * silently replaces catalog.ts's existing `productVariantsRelations`
 * (`product`, `images`) instead of adding to it. Confirmed the hard way:
 * a `relations(productVariants, ...)` here broke `cart/quote.ts`'s
 * `variant.product`/`variant.images` typing until this was reverted to a
 * one-directional `inventory -> variant` relation instead.
 */
export const inventoryRelations = relations(inventory, ({ one }) => ({
  variant: one(productVariants, {
    fields: [inventory.variantId],
    references: [productVariants.id],
  }),
}));

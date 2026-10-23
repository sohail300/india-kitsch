import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { appSchema } from "./_shared";
import { user } from "./auth";
import { productVariants } from "./catalog";
import { orders } from "./commerce";
import { createId } from "@/server/lib/ids";

/**
 * Inventory tables - docs/03 §4 "Catalog" (inventory, stock_movements)
 * and docs/03 §11 "Inventory / stock handling". The three CHECK
 * constraints on `inventory` are what make an oversell impossible even if
 * the application's conditional-UPDATE code (docs/03 §11) has a bug.
 */

export const stockMovementReasonEnum = appSchema.enum("stock_movement_reason", [
  "reserve",
  "release",
  "sale",
  "return",
  "adjustment",
  "restock",
]);

export const inventory = appSchema.table(
  "inventory",
  {
    variantId: text("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("inventory_on_hand_non_negative", sql`${table.onHand} >= 0`),
    check("inventory_reserved_non_negative", sql`${table.reserved} >= 0`),
    check("inventory_reserved_within_on_hand", sql`${table.reserved} <= ${table.onHand}`),
  ],
);

export const stockMovements = appSchema.table(
  "stock_movements",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: stockMovementReasonEnum("reason").notNull(),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    adminUserId: text("admin_user_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_variant_id_idx").on(table.variantId),
    index("stock_movements_order_id_idx").on(table.orderId),
  ],
);

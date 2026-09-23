import { boolean, index, integer, jsonb, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { appSchema } from "./_shared";
import { createId } from "@/server/lib/ids";

/**
 * Catalog tables — docs/03 §4 "Catalog". See docs/07 §12 for how
 * `product_images.r2Key` relates to the actual R2 objects, and docs/05
 * §7 for the trigram search index on `products.name`, added as a
 * follow-up custom migration (not expressible cleanly through Drizzle's
 * typed index API) rather than here.
 */

export const productStatusEnum = appSchema.enum("product_status", ["draft", "active", "archived"]);
export const sizeChartUnitEnum = appSchema.enum("size_chart_unit", ["cm", "in"]);

export const categories = appSchema.table(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    // 1-level nesting in v1 (docs/03 §4) — a child's own parentId is
    // always null, enforced in the service layer, not the DB.
    parentId: text("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    imageKey: text("image_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("categories_parent_id_idx").on(table.parentId)],
);

export const sizeCharts = appSchema.table("size_charts", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  unit: sizeChartUnitEnum("unit").notNull(),
  // Shown on the PDP as a table the admin edits directly (docs/03 §4).
  columns: jsonb("columns").notNull().$type<string[]>(),
  rows: jsonb("rows").notNull().$type<Record<string, string>[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = appSchema.table(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    slug: text("slug").notNull().unique(),
    // Plain text or sanitised markdown — never raw HTML (docs/04 §14).
    description: text("description"),
    name: text("name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    sizeChartId: text("size_chart_id").references(() => sizeCharts.id, { onDelete: "set null" }),
    // GST-inclusive selling price; see docs/06 §9 for how tax.ts splits it.
    pricePaise: integer("price_paise").notNull(),
    mrpPaise: integer("mrp_paise"),
    gstRateBps: integer("gst_rate_bps").notNull(),
    hsnCode: text("hsn_code"),
    status: productStatusEnum("status").notNull().default("draft"),
    isFeatured: boolean("is_featured").notNull().default(false),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("products_status_category_idx").on(table.status, table.categoryId),
    index("products_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const productVariants = appSchema.table(
  "product_variants",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    size: text("size").notNull(),
    color: text("color").notNull(),
    colorHex: text("color_hex"),
    // Null means "use products.pricePaise" — see docs/03 §4 design note.
    pricePaise: integer("price_paise"),
    mrpPaise: integer("mrp_paise"),
    weightGrams: integer("weight_grams"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("product_variants_product_size_color_key").on(table.productId, table.size, table.color),
    index("product_variants_product_id_idx").on(table.productId),
  ],
);

export const productImages = appSchema.table(
  "product_images",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Color-specific images — null means "shown for every color".
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    alt: text("alt").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    index("product_images_product_id_idx").on(table.productId),
    index("product_images_variant_id_idx").on(table.variantId),
  ],
);

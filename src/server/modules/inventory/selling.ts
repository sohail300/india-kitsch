import { and, eq, ne, sql } from "drizzle-orm";
import { productImages, products, productVariants } from "@/server/db/schema";
import { qualified } from "@/server/db/sql-helpers";

/**
 * "For sale": the size & colour is Selling (not paused) and its product
 * isn't archived. Low-stock views — the dashboard card, Inventory's
 * default view and its low filter, the Products list's "N low" — use this,
 * so something the owner deliberately stopped selling never shows up as
 * "running low". Needs `product_variants` and `products` in the query.
 */
export const isForSale = and(eq(productVariants.isActive, true), ne(products.status, "archived"));

/** The product's main photo key (first by `isPrimary`, then order), or null. Needs `products`. */
export const mainPhotoKeySql = sql<string | null>`(
  select ${productImages.r2Key} from ${productImages}
  where ${productImages.productId} = ${qualified(products.id)}
  order by ${productImages.isPrimary} desc, ${productImages.sortOrder} asc
  limit 1
)`;

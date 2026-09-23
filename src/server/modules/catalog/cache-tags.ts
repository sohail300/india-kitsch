import "server-only";

/**
 * Cache tag contract for the catalog (docs/05 §7: "Home, category and
 * product pages are cached with tags; admin mutations revalidate the
 * relevant tags"). No `"use cache"` component exists yet — the frontend is
 * Phase 10+ — but the tag names are decided now so every future cached
 * component and every admin mutation (Phase 7) agree on the same strings
 * instead of each guessing one.
 */

export const PRODUCTS_TAG = "products";

export function productTag(productId: string): string {
  return `product:${productId}`;
}

export function categoryTag(categoryId: string): string {
  return `category:${categoryId}`;
}

/** Tags to revalidate after a product is created, edited, or its status changes. */
export function tagsForProductMutation(productId: string, categoryId: string): string[] {
  return [PRODUCTS_TAG, productTag(productId), categoryTag(categoryId)];
}

/** Tags to revalidate after a category is created, edited, or reordered. */
export function tagsForCategoryMutation(categoryId: string): string[] {
  return [PRODUCTS_TAG, categoryTag(categoryId)];
}

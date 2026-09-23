import "server-only";
import { and, asc, desc, eq, exists, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { categories, productImages, products, productVariants } from "@/server/db/schema";
import type { ListProductsInput } from "./schemas";
import { PRODUCTS_PAGE_SIZE } from "./schemas";

/**
 * Every function here takes an optional last `dbHandle` argument, defaulting
 * to the real `db` singleton. Production call sites never pass it;
 * integration tests pass a handle bound to TEST_DATABASE_URL (local/CI
 * Postgres, docs/09 §20) instead of Supabase.
 */

export async function getCategoryBySlug(slug: string, dbHandle: DbOrTx = db) {
  return dbHandle.query.categories.findFirst({
    where: and(eq(categories.slug, slug), eq(categories.isActive, true)),
  });
}

/** Flat, sortOrder-ordered list — 1-level nesting (docs/03 §4), so callers group by parentId themselves. */
export async function listActiveCategories(dbHandle: DbOrTx = db) {
  return dbHandle.query.categories.findMany({
    where: eq(categories.isActive, true),
    orderBy: [asc(categories.sortOrder), asc(categories.name)],
  });
}

/** Full product detail for the PDP: variants, images, category and size chart. Does not filter by status — callers check `status === "active"` (or allow drafts for admin preview). */
export async function getProductBySlug(slug: string, dbHandle: DbOrTx = db) {
  return dbHandle.query.products.findFirst({
    where: eq(products.slug, slug),
    with: {
      category: true,
      sizeChart: true,
      variants: { orderBy: [asc(productVariants.sortOrder)] },
      images: { orderBy: [asc(productImages.sortOrder)] },
    },
  });
}

/** The effective selling price used for filtering/sorting: a variant's own price if set, else the product's. */
const effectiveVariantPrice = sql<number>`coalesce(${productVariants.pricePaise}, ${products.pricePaise})`;

function buildListProductsWhere(
  input: ListProductsInput,
  categoryId: string | undefined,
  dbHandle: DbOrTx,
) {
  const conditions = [eq(products.status, "active")];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (input.size || input.color || input.minPaise !== undefined || input.maxPaise !== undefined) {
    const variantConditions = [
      eq(productVariants.productId, products.id),
      eq(productVariants.isActive, true),
    ];
    if (input.size) variantConditions.push(eq(productVariants.size, input.size));
    if (input.color) variantConditions.push(eq(productVariants.color, input.color));
    if (input.minPaise !== undefined)
      variantConditions.push(gte(effectiveVariantPrice, input.minPaise));
    if (input.maxPaise !== undefined)
      variantConditions.push(lte(effectiveVariantPrice, input.maxPaise));

    conditions.push(
      exists(
        dbHandle
          .select({ one: sql`1` })
          .from(productVariants)
          .where(and(...variantConditions)),
      ),
    );
  }

  if (input.q) {
    // pg_trgm GIN index on lower(name) (drizzle/0004) backs this; description
    // match is a plain (unindexed) bonus, fine at v1 scale (docs/03 §4 "Search").
    conditions.push(
      or(ilike(products.name, `%${input.q}%`), ilike(products.description, `%${input.q}%`))!,
    );
  }

  return and(...conditions);
}

function sortColumn(sort: ListProductsInput["sort"]) {
  switch (sort) {
    case "price_asc":
      return asc(products.pricePaise);
    case "price_desc":
      return desc(products.pricePaise);
    case "newest":
      return desc(products.createdAt);
  }
}

export interface ListProductsResult {
  items: (typeof products.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** One indexed, joined query for the listing page — no N+1 (docs/05 §7). */
export async function listProducts(
  input: ListProductsInput,
  dbHandle: DbOrTx = db,
): Promise<ListProductsResult> {
  const category = input.categorySlug
    ? await getCategoryBySlug(input.categorySlug, dbHandle)
    : undefined;
  if (input.categorySlug && !category) {
    return { items: [], total: 0, page: input.page, pageSize: PRODUCTS_PAGE_SIZE, totalPages: 0 };
  }

  const where = buildListProductsWhere(input, category?.id, dbHandle);

  const [items, [{ count }]] = await Promise.all([
    dbHandle
      .select()
      .from(products)
      .where(where)
      .orderBy(sortColumn(input.sort))
      .limit(PRODUCTS_PAGE_SIZE)
      .offset((input.page - 1) * PRODUCTS_PAGE_SIZE),
    dbHandle
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
  ]);

  return {
    items,
    total: count,
    page: input.page,
    pageSize: PRODUCTS_PAGE_SIZE,
    totalPages: Math.ceil(count / PRODUCTS_PAGE_SIZE),
  };
}

export interface ProductFacets {
  sizes: string[];
  colors: string[];
  minPricePaise: number | null;
  maxPricePaise: number | null;
}

/** Distinct filter values for the currently visible active products, optionally scoped to one category (docs/05 §7: "Facet values come from a cached query"). */
export async function listFacets(
  categorySlug?: string,
  dbHandle: DbOrTx = db,
): Promise<ProductFacets> {
  const category = categorySlug ? await getCategoryBySlug(categorySlug, dbHandle) : undefined;
  if (categorySlug && !category) {
    return { sizes: [], colors: [], minPricePaise: null, maxPricePaise: null };
  }

  const scope = and(
    eq(products.status, "active"),
    eq(productVariants.productId, products.id),
    eq(productVariants.isActive, true),
    category ? eq(products.categoryId, category.id) : undefined,
  );

  const [sizeRows, colorRows, [priceRow]] = await Promise.all([
    dbHandle
      .selectDistinct({ size: productVariants.size })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(scope)
      .orderBy(asc(productVariants.size)),
    dbHandle
      .selectDistinct({ color: productVariants.color })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(scope)
      .orderBy(asc(productVariants.color)),
    dbHandle
      .select({
        min: sql<number | null>`min(${effectiveVariantPrice})`,
        max: sql<number | null>`max(${effectiveVariantPrice})`,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(scope),
  ]);

  return {
    sizes: sizeRows.map((r) => r.size),
    colors: colorRows.map((r) => r.color),
    minPricePaise: priceRow?.min ?? null,
    maxPricePaise: priceRow?.max ?? null,
  };
}

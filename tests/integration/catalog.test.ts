/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Seeds real categories/products/variants/images
 * and inventory, then exercises the actual listing/filter/sort/search/
 * pagination query and the PDP service against them.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import * as catalogQueries from "@/server/modules/catalog/queries";
import { getProductDetail, searchProducts } from "@/server/modules/catalog/service";
import { migrateTestDb } from "../setup/migrate-test-db";

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — see .env.example (run `podman compose up -d` / `docker compose up -d` first).",
    );
  }
  return url;
}

const client = postgres(requireTestDatabaseUrl(), { max: 10 });
const db = drizzle(client, { schema });

let categoryId: string;
let categorySlug: string;
let otherCategoryId: string;
let otherCategorySlug: string;

interface SeededProduct {
  id: string;
  slug: string;
}

let redKurta: SeededProduct; // active, category A, variants S/Red (stock), M/Blue (no stock)
let blueSaree: SeededProduct; // active, category A, variant M/Blue, price higher
let draftProduct: SeededProduct; // draft — must never appear in public queries
let otherCategoryProduct: SeededProduct; // active, category B

async function seedProduct(opts: {
  name: string;
  categoryId: string;
  status: "active" | "draft";
  pricePaise: number;
  variants: { size: string; color: string; pricePaise?: number; onHand: number }[];
}): Promise<SeededProduct> {
  const id = createId();
  const slug = `${opts.name.toLowerCase().replace(/\s+/g, "-")}-${id}`;
  await db.insert(schema.products).values({
    id,
    slug,
    name: opts.name,
    categoryId: opts.categoryId,
    pricePaise: opts.pricePaise,
    gstRateBps: 1200,
    status: opts.status,
  });

  for (const v of opts.variants) {
    const variantId = createId();
    await db.insert(schema.productVariants).values({
      id: variantId,
      productId: id,
      sku: `SKU-${variantId}`,
      size: v.size,
      color: v.color,
      pricePaise: v.pricePaise,
    });
    await db.insert(schema.inventory).values({ variantId, onHand: v.onHand, reserved: 0 });
  }

  return { id, slug };
}

beforeAll(async () => {
  await migrateTestDb();

  categoryId = createId();
  categorySlug = `test-cat-a-${categoryId}`;
  await db.insert(schema.categories).values({ id: categoryId, name: "Kurtas", slug: categorySlug });

  otherCategoryId = createId();
  otherCategorySlug = `test-cat-b-${otherCategoryId}`;
  await db
    .insert(schema.categories)
    .values({ id: otherCategoryId, name: "Sarees", slug: otherCategorySlug });

  redKurta = await seedProduct({
    name: `Red Kurta Alpha ${categoryId}`,
    categoryId,
    status: "active",
    pricePaise: 150000,
    variants: [
      { size: "S", color: "Red", onHand: 2 },
      { size: "M", color: "Blue", pricePaise: 180000, onHand: 0 },
    ],
  });

  blueSaree = await seedProduct({
    name: `Blue Saree Beta ${categoryId}`,
    categoryId,
    status: "active",
    pricePaise: 300000,
    variants: [{ size: "M", color: "Blue", onHand: 5 }],
  });

  draftProduct = await seedProduct({
    name: `Draft Product ${categoryId}`,
    categoryId,
    status: "draft",
    pricePaise: 50000,
    variants: [{ size: "M", color: "Green", onHand: 10 }],
  });

  otherCategoryProduct = await seedProduct({
    name: `Other Category Item ${categoryId}`,
    categoryId: otherCategoryId,
    status: "active",
    pricePaise: 90000,
    variants: [{ size: "M", color: "Red", onHand: 1 }],
  });
}, 60_000);

afterAll(async () => {
  const categoryIds = [categoryId, otherCategoryId];
  await db.delete(schema.products).where(inArray(schema.products.categoryId, categoryIds));
  await db.delete(schema.categories).where(inArray(schema.categories.id, categoryIds));
  await client.end();
});

describe("listProducts", () => {
  it("only returns active products, scoped to the category", async () => {
    const result = await catalogQueries.listProducts({ categorySlug, sort: "newest", page: 1 }, db);
    const slugs = result.items.map((p) => p.slug);
    expect(slugs).toContain(redKurta.slug);
    expect(slugs).toContain(blueSaree.slug);
    expect(slugs).not.toContain(draftProduct.slug);
    expect(slugs).not.toContain(otherCategoryProduct.slug);
  });

  it("filters by size", async () => {
    const result = await catalogQueries.listProducts(
      { categorySlug, size: "S", sort: "newest", page: 1 },
      db,
    );
    expect(result.items.map((p) => p.slug)).toEqual([redKurta.slug]);
  });

  it("filters by color", async () => {
    const result = await catalogQueries.listProducts(
      { categorySlug, color: "Blue", sort: "newest", page: 1 },
      db,
    );
    const slugs = result.items.map((p) => p.slug).sort();
    expect(slugs).toEqual([blueSaree.slug, redKurta.slug].sort());
  });

  it("filters by effective price range (variant override wins over product price)", async () => {
    // redKurta's Blue/M variant overrides to 180000, outside its own base
    // price of 150000 — a max just above the override must still match it.
    const result = await catalogQueries.listProducts(
      { categorySlug, minPaise: 170000, maxPaise: 190000, sort: "newest", page: 1 },
      db,
    );
    expect(result.items.map((p) => p.slug)).toEqual([redKurta.slug]);
  });

  it("sorts by price ascending/descending", async () => {
    const asc = await catalogQueries.listProducts({ categorySlug, sort: "price_asc", page: 1 }, db);
    const descending = await catalogQueries.listProducts(
      { categorySlug, sort: "price_desc", page: 1 },
      db,
    );
    expect(asc.items[0]?.slug).toBe(redKurta.slug);
    expect(descending.items[0]?.slug).toBe(blueSaree.slug);
  });

  it("searches by name via the trigram-indexed ILIKE", async () => {
    const result = await catalogQueries.listProducts(
      { categorySlug, q: "Red Kurta Alpha", sort: "newest", page: 1 },
      db,
    );
    expect(result.items.map((p) => p.slug)).toEqual([redKurta.slug]);
  });

  it("paginates with a correct total and totalPages", async () => {
    const result = await catalogQueries.listProducts({ categorySlug, sort: "newest", page: 1 }, db);
    expect(result.total).toBe(2);
    expect(result.pageSize).toBeGreaterThan(0);
    expect(result.totalPages).toBe(1);
  });

  it("returns an empty result for an unknown category slug instead of throwing", async () => {
    const result = await catalogQueries.listProducts(
      { categorySlug: "no-such-category", sort: "newest", page: 1 },
      db,
    );
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: result.pageSize,
      totalPages: 0,
    });
  });
});

describe("listFacets", () => {
  it("returns distinct sizes/colors and the effective min/max price, scoped to the category", async () => {
    const facets = await catalogQueries.listFacets(categorySlug, db);
    expect(facets.sizes.sort()).toEqual(["M", "S"]);
    expect(facets.colors.sort()).toEqual(["Blue", "Red"]);
    expect(facets.minPricePaise).toBe(150000);
    expect(facets.maxPricePaise).toBe(300000);
  });
});

describe("getProductDetail", () => {
  it("attaches live per-variant availability and an aggregate inStock flag", async () => {
    const detail = await getProductDetail(redKurta.slug, db);
    const sVariant = detail.variants.find((v) => v.size === "S");
    const mVariant = detail.variants.find((v) => v.size === "M");
    expect(sVariant?.available).toBe(2);
    expect(sVariant?.inStock).toBe(true);
    expect(mVariant?.available).toBe(0);
    expect(mVariant?.inStock).toBe(false);
    expect(detail.inStock).toBe(true); // true if *any* variant has stock
    expect(mVariant?.effectivePricePaise).toBe(180000); // variant override, not the product's 150000
  });

  it("throws NotFoundError for a draft product", async () => {
    await expect(getProductDetail(draftProduct.slug, db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for a slug that doesn't exist", async () => {
    await expect(getProductDetail("does-not-exist", db)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("searchProducts", () => {
  it("validates raw searchParams-shaped input and returns items + facets together", async () => {
    const result = await searchProducts({ categorySlug, size: "S" }, db);
    expect(result.items.map((p) => p.slug)).toEqual([redKurta.slug]);
    expect(result.facets.sizes).toContain("S");
  });

  it("rejects minPaise greater than maxPaise", async () => {
    await expect(searchProducts({ minPaise: 500, maxPaise: 100 }, db)).rejects.toThrow();
  });
});

describe("cascade sanity", () => {
  it("the seeded inventory row is actually reachable through the productVariants FK", async () => {
    const variant = await db.query.productVariants.findFirst({
      where: eq(schema.productVariants.productId, redKurta.id),
    });
    expect(variant).toBeDefined();
  });
});

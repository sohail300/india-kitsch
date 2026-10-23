import "server-only";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { NotFoundError } from "@/server/lib/errors";
import { getAvailability } from "@/server/modules/inventory/queries";
import * as queries from "./queries";
import { listProductsInputSchema } from "./schemas";
import type { ListProductsInput } from "./schemas";

export interface VariantDetail {
  id: string;
  size: string;
  color: string;
  colorHex: string | null;
  sku: string;
  isActive: boolean;
  /** The variant's own price if set, else the product's - never null. */
  effectivePricePaise: number;
  effectiveMrpPaise: number | null;
  available: number;
  inStock: boolean;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: { id: string; name: string; slug: string };
  sizeChart: {
    id: string;
    name: string;
    unit: "cm" | "in";
    columns: string[];
    rows: Record<string, string>[];
  } | null;
  pricePaise: number;
  mrpPaise: number | null;
  gstRateBps: number;
  seoTitle: string | null;
  seoDescription: string | null;
  variants: VariantDetail[];
  images: {
    id: string;
    variantId: string | null;
    r2Key: string;
    alt: string;
    width: number;
    height: number;
    isPrimary: boolean;
  }[];
  /** True if any active variant has stock available right now - the PDP still streams live per-variant numbers separately (docs/05 §7), this is just for listing badges. */
  inStock: boolean;
}

/**
 * PDP data: the product row plus, live (never cached - docs/05 §7 "cached
 * HTML never lies about stock"), each variant's real availability.
 */
export async function getProductDetail(
  slug: string,
  dbHandle: DbOrTx = db,
): Promise<ProductDetail> {
  const product = await queries.getProductBySlug(slug, dbHandle);
  // A hidden category hides its products too (see catalog/queries.ts).
  if (!product || product.status !== "active" || !product.category.isActive) {
    throw new NotFoundError(`Product "${slug}"`);
  }

  const activeVariants = product.variants.filter((v) => v.isActive);
  const availability = await getAvailability(
    activeVariants.map((v) => v.id),
    dbHandle,
  );

  const variants: VariantDetail[] = activeVariants.map((variant) => {
    const stock = availability.get(variant.id);
    return {
      id: variant.id,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      sku: variant.sku,
      isActive: variant.isActive,
      effectivePricePaise: variant.pricePaise ?? product.pricePaise,
      effectiveMrpPaise: variant.mrpPaise ?? product.mrpPaise,
      available: stock?.available ?? 0,
      inStock: (stock?.available ?? 0) > 0,
    };
  });

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
    sizeChart: product.sizeChart,
    pricePaise: product.pricePaise,
    mrpPaise: product.mrpPaise,
    gstRateBps: product.gstRateBps,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    variants,
    images: product.images,
    inStock: variants.some((v) => v.inStock),
  };
}

export interface SearchProductsResult extends queries.ListProductsResult {
  facets: queries.ProductFacets;
}

/** Validates raw (e.g. `searchParams`-shaped) input and runs the listing + facet queries together. */
export async function searchProducts(
  rawInput: unknown,
  dbHandle: DbOrTx = db,
): Promise<SearchProductsResult> {
  const input: ListProductsInput = listProductsInputSchema.parse(rawInput);
  const [result, facets] = await Promise.all([
    queries.listProducts(input, dbHandle),
    queries.listFacets(input.categorySlug, dbHandle),
  ]);
  return { ...result, facets };
}

export async function listCategories(dbHandle: DbOrTx = db) {
  return queries.listActiveCategories(dbHandle);
}

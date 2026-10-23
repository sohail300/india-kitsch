import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  // Lowercased first, so "Summer-Kurta" is accepted as "summer-kurta" rather than rejected.
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers and hyphens only");

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  imageKey: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

export const productStatusValues = ["draft", "active", "archived"] as const;

export const createProductInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000).optional(),
  categoryId: z.string().min(1),
  sizeChartId: z.string().min(1).optional(),
  pricePaise: z.number().int().positive(),
  mrpPaise: z.number().int().positive().optional(),
  gstRateBps: z.number().int().min(0).max(2800),
  hsnCode: z.string().trim().max(20).optional(),
  status: z.enum(productStatusValues).default("draft"),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = createProductInputSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

const colorSchema = z.object({
  name: z.string().trim().min(1).max(40),
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/** The variant matrix generator (docs/07 §13): sizes × colors → SKUs. */
export const generateVariantMatrixInputSchema = z.object({
  productId: z.string().min(1),
  sizes: z.array(z.string().trim().min(1).max(20)).min(1).max(20),
  colors: z.array(colorSchema).min(1).max(20),
  /** Optional — defaults to the product's slug, so owners never have to invent SKUs. */
  skuPrefix: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "skuPrefix must be letters, numbers and hyphens only")
    .optional(),
  /**
   * Stock each new size × colour starts with (missing = 0). Entered while
   * creating the units — the one place outside Inventory that sets a
   * quantity (.impeccable.md, "One place per job").
   */
  startingStock: z
    .array(
      z.object({
        size: z.string().trim().min(1).max(20),
        color: z.string().trim().min(1).max(40),
        quantity: z.number().int().min(0).max(100_000),
      }),
    )
    .max(400)
    .optional(),
});
export type GenerateVariantMatrixInput = z.infer<typeof generateVariantMatrixInputSchema>;

export const reorderImagesInputSchema = z.object({
  productId: z.string().min(1),
  imageIdsInOrder: z.array(z.string().min(1)).min(1).max(100),
});
export type ReorderImagesInput = z.infer<typeof reorderImagesInputSchema>;

/**
 * Per-variant price override and active toggle (docs/07 §13 Products:
 * "per-variant price/stock") - sku/size/color stay immutable once created
 * (identity, `unique(productId, size, color)`); stock itself is
 * `inventory/admin.ts`'s `adjustStock`, not this. `pricePaise`/`mrpPaise`
 * are nullable so an admin can clear an override back to "inherit the
 * product's price" (docs/03 §4 design note on `product_variants.pricePaise`).
 */
export const updateVariantInputSchema = z.object({
  pricePaise: z.number().int().positive().nullable().optional(),
  mrpPaise: z.number().int().positive().nullable().optional(),
  weightGrams: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantInputSchema>;

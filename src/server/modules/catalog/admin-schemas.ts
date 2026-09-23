import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers and hyphens only");

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  imageKey: z.string().trim().min(1).optional(),
  /** 1-level nesting only (docs/03 §4) — a category whose own parentId is non-null can't be used as a parent. Enforced by the service, not the DB. */
  parentId: z.string().min(1).optional(),
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
  skuPrefix: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "skuPrefix must be letters, numbers and hyphens only"),
});
export type GenerateVariantMatrixInput = z.infer<typeof generateVariantMatrixInputSchema>;

export const reorderImagesInputSchema = z.object({
  productId: z.string().min(1),
  imageIdsInOrder: z.array(z.string().min(1)).min(1).max(100),
});
export type ReorderImagesInput = z.infer<typeof reorderImagesInputSchema>;

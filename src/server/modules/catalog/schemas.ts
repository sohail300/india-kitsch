import { z } from "zod";

/** Products per listing page — also used to compute pagination metadata. */
export const PRODUCTS_PAGE_SIZE = 24;

export const productSortSchema = z.enum(["newest", "price_asc", "price_desc"]);
export type ProductSort = z.infer<typeof productSortSchema>;

/**
 * URL-driven listing/filter input (docs/05 §7: `/shop?category=&size=&
 * color=&min=&max=&sort=&page=`). `z.coerce` so it parses directly out of
 * `URLSearchParams`/`searchParams` string values.
 */
export const listProductsInputSchema = z
  .object({
    categorySlug: z.string().trim().min(1).max(200).optional(),
    size: z.string().trim().min(1).max(50).optional(),
    color: z.string().trim().min(1).max(50).optional(),
    minPaise: z.coerce.number().int().nonnegative().optional(),
    maxPaise: z.coerce.number().int().nonnegative().optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: productSortSchema.default("newest"),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine(
    (input) =>
      input.minPaise === undefined ||
      input.maxPaise === undefined ||
      input.minPaise <= input.maxPaise,
    {
      message: "minPaise must be less than or equal to maxPaise",
      path: ["minPaise"],
    },
  );

export type ListProductsInput = z.infer<typeof listProductsInputSchema>;

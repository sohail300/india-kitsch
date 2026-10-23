import "server-only";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  categories,
  inventory,
  productImages,
  products,
  orderItems,
  productVariants,
  stockMovements,
} from "@/server/db/schema";
import {
  CategoryNotEmptyError,
  NotFoundError,
  ProductHasOrdersError,
  VariantNotDeletableError,
} from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";
import {
  categoryTag,
  productTag,
  tagsForCategoryMutation,
  tagsForProductMutation,
} from "./cache-tags";
import type {
  CreateCategoryInput,
  CreateProductInput,
  GenerateVariantMatrixInput,
  ReorderImagesInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./admin-schemas";
import {
  createCategoryInputSchema,
  createProductInputSchema,
  generateVariantMatrixInputSchema,
  reorderImagesInputSchema,
  updateCategoryInputSchema,
  updateProductInputSchema,
  updateVariantInputSchema,
} from "./admin-schemas";

/**
 * Admin write-side of the catalog module - `catalog/service.ts` stays
 * customer-facing reads only (docs/02's module split). Every mutation
 * writes an `audit_log` row in the same transaction (docs/07 §13) and
 * returns which cache tags the caller (a Server Action, Phase 11) should
 * revalidate - this module never calls `revalidateTag` itself, since that
 * only works inside a real Next.js request context, not in tests or
 * scripts (docs/05 §7's cache-tags.ts).
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof categories.$inferSelect>> {
  const input: CreateCategoryInput = createCategoryInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const [{ maxOrder }] = await tx
      .select({ maxOrder: max(categories.sortOrder) })
      .from(categories);
    const [category] = await tx
      .insert(categories)
      .values({ id: createId(), sortOrder: (maxOrder ?? -1) + 1, ...input })
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "category.create",
      entityType: "category",
      entityId: category!.id,
      after: category,
    });

    return { result: category!, revalidateTags: tagsForCategoryMutation(category!.id) };
  });
}

export async function updateCategory(
  categoryId: string,
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof categories.$inferSelect>> {
  const input: UpdateCategoryInput = updateCategoryInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!before) throw new NotFoundError(`Category ${categoryId}`);

    const [after] = await tx
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, categoryId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "category.update",
      entityType: "category",
      entityId: categoryId,
      before,
      after,
    });

    return { result: after!, revalidateTags: tagsForCategoryMutation(categoryId) };
  });
}

export async function setCategoryActive(
  categoryId: string,
  isActive: boolean,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof categories.$inferSelect>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!before) throw new NotFoundError(`Category ${categoryId}`);

    const [after] = await tx
      .update(categories)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(categories.id, categoryId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: isActive ? "category.activate" : "category.deactivate",
      entityType: "category",
      entityId: categoryId,
      before,
      after,
    });

    return { result: after!, revalidateTags: tagsForCategoryMutation(categoryId) };
  });
}

/**
 * Deletes a category, only while it has no products. The count check gives
 * a clear message; `products.category_id`'s `ON DELETE RESTRICT` is the
 * backstop if a product is added concurrently (that surfaces as a Postgres
 * FK violation, mapped to the same error).
 */
export async function deleteCategory(
  categoryId: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ id: string }>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.categories.findFirst({ where: eq(categories.id, categoryId) });
    if (!before) throw new NotFoundError(`Category ${categoryId}`);

    const [{ productCount }] = await tx
      .select({ productCount: count() })
      .from(products)
      .where(eq(products.categoryId, categoryId));
    if (productCount > 0) throw new CategoryNotEmptyError(before.name, productCount);

    try {
      await tx.delete(categories).where(eq(categories.id, categoryId));
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new CategoryNotEmptyError(before.name, 1);
      throw error;
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "category.delete",
      entityType: "category",
      entityId: categoryId,
      before,
    });

    return { result: { id: categoryId }, revalidateTags: tagsForCategoryMutation(categoryId) };
  });
}

function isForeignKeyViolation(error: unknown): boolean {
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  return !!cause && typeof cause === "object" && "code" in cause && cause.code === "23503";
}

/**
 * Drag-to-reorder. `orderedCategoryIds` is the new order of **some**
 * categories — the rows the admin can see (one page, or search results),
 * not necessarily all of them. Those categories swap among the positions
 * they already hold; every other category keeps its place. The whole list
 * is then renumbered 0..n-1, which also clears any ties or gaps.
 */
export async function reorderCategories(
  orderedCategoryIds: string[],
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ count: number }>> {
  return dbHandle.transaction(async (tx) => {
    // Lock every row so two concurrent reorders can't interleave.
    const current = await tx
      .select({ id: categories.id })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id))
      .for("update");
    const currentIds = current.map((c) => c.id);

    const moving = new Set(orderedCategoryIds);
    if (moving.size !== orderedCategoryIds.length) {
      throw new Error("reorderCategories: duplicate category ids");
    }
    const missing = orderedCategoryIds.find((id) => !currentIds.includes(id));
    if (missing) throw new NotFoundError(`Category ${missing}`);

    // Fill the slots the moved categories occupy, in their new order.
    const incoming = [...orderedCategoryIds];
    const nextIds = currentIds.map((id) => (moving.has(id) ? incoming.shift()! : id));

    const now = new Date();
    for (let i = 0; i < nextIds.length; i++) {
      await tx
        .update(categories)
        .set({ sortOrder: i, updatedAt: now })
        .where(eq(categories.id, nextIds[i]!));
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "category.reorder",
      entityType: "category",
      entityId: "bulk",
      before: { orderedCategoryIds: currentIds },
      after: { orderedCategoryIds: nextIds },
    });

    return {
      result: { count: orderedCategoryIds.length },
      revalidateTags: [...new Set(nextIds.flatMap((id) => tagsForCategoryMutation(id)))],
    };
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProduct(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof products.$inferSelect>> {
  const input: CreateProductInput = createProductInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const category = await tx.query.categories.findFirst({
      where: eq(categories.id, input.categoryId),
    });
    if (!category) throw new NotFoundError(`Category ${input.categoryId}`);

    const [product] = await tx
      .insert(products)
      .values({
        id: createId(),
        ...input,
        publishedAt: input.status === "active" ? new Date() : null,
      })
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.create",
      entityType: "product",
      entityId: product!.id,
      after: product,
    });

    return {
      result: product!,
      revalidateTags: tagsForProductMutation(product!.id, product!.categoryId),
    };
  });
}

export async function updateProduct(
  productId: string,
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof products.$inferSelect>> {
  const input: UpdateProductInput = updateProductInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.products.findFirst({ where: eq(products.id, productId) });
    if (!before) throw new NotFoundError(`Product ${productId}`);

    if (input.categoryId) {
      const category = await tx.query.categories.findFirst({
        where: eq(categories.id, input.categoryId),
      });
      if (!category) throw new NotFoundError(`Category ${input.categoryId}`);
    }

    const becomingActive = input.status === "active" && before.status !== "active";

    const [after] = await tx
      .update(products)
      .set({
        ...input,
        ...(becomingActive ? { publishedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.update",
      entityType: "product",
      entityId: productId,
      before,
      after,
    });

    return {
      result: after!,
      revalidateTags: [
        ...tagsForProductMutation(productId, after!.categoryId),
        ...(before.categoryId !== after!.categoryId ? [categoryTag(before.categoryId)] : []),
      ],
    };
  });
}

/**
 * Deletes a product that has never been ordered, with everything under it:
 * sizes & colours, their stock and stock history, and its photos (rows
 * cascade). Returns the photos' R2 keys so the caller can remove the files
 * after the transaction commits. A product with orders can only be archived.
 */
export async function deleteProduct(
  productId: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ id: string; imageKeys: string[] }>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.products.findFirst({ where: eq(products.id, productId) });
    if (!before) throw new NotFoundError(`Product ${productId}`);

    const [{ orderLines }] = await tx
      .select({ orderLines: count() })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(eq(productVariants.productId, productId));
    if (orderLines > 0) throw new ProductHasOrdersError(before.name);

    const images = await tx
      .select({ r2Key: productImages.r2Key })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    await tx.delete(products).where(eq(products.id, productId));

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.delete",
      entityType: "product",
      entityId: productId,
      before,
    });

    return {
      result: { id: productId, imageKeys: images.map((img) => img.r2Key) },
      revalidateTags: tagsForProductMutation(productId, before.categoryId),
    };
  });
}

export async function setProductStatus(
  productId: string,
  status: (typeof products.$inferSelect)["status"],
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof products.$inferSelect>> {
  return updateProduct(productId, { status }, adminUserId, dbHandle);
}

export interface VariantMatrixResult {
  created: (typeof productVariants.$inferSelect)[];
  skipped: { size: string; color: string }[];
}

/** "Chikankari Suit-M-Off White" -> "CHIKANKARI-SUIT-M-OFF-WHITE". */
function toSku(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** SKUs are globally unique; on the rare clash (e.g. a reused slug) append -2, -3, ... */
async function uniqueSku(tx: DbOrTx, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await tx.query.productVariants.findFirst({
      where: eq(productVariants.sku, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
}

/**
 * sizes × colors → SKUs (docs/07 §13). Idempotent against re-running with
 * an overlapping matrix: a (size, color) pair that already exists for this
 * product is skipped, not duplicated or errored on - `unique(productId,
 * size, color)` is the backstop, this pre-check is what makes re-running
 * safe rather than merely non-corrupting.
 */
export async function generateVariantMatrix(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<VariantMatrixResult>> {
  const input: GenerateVariantMatrixInput = generateVariantMatrixInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({ where: eq(products.id, input.productId) });
    if (!product) throw new NotFoundError(`Product ${input.productId}`);

    const existing = await tx.query.productVariants.findMany({
      where: eq(productVariants.productId, input.productId),
    });
    const existingPairs = new Set(existing.map((v) => `${v.size}::${v.color}`));

    const created: (typeof productVariants.$inferSelect)[] = [];
    const skipped: { size: string; color: string }[] = [];
    let sortOrder = existing.length;
    const prefix = input.skuPrefix ?? product.slug;
    const startingQuantity = new Map(
      (input.startingStock ?? []).map((s) => [`${s.size}::${s.color}`, s.quantity]),
    );

    for (const size of input.sizes) {
      for (const color of input.colors) {
        if (existingPairs.has(`${size}::${color.name}`)) {
          skipped.push({ size, color: color.name });
          continue;
        }

        const variantId = createId();
        const sku = await uniqueSku(tx, toSku(`${prefix}-${size}-${color.name}`));
        const quantity = startingQuantity.get(`${size}::${color.name}`) ?? 0;

        const [variant] = await tx
          .insert(productVariants)
          .values({
            id: variantId,
            productId: input.productId,
            sku,
            size,
            color: color.name,
            colorHex: color.hex,
            sortOrder,
          })
          .returning();
        await tx.insert(inventory).values({ variantId, onHand: quantity, reserved: 0 });
        if (quantity > 0) {
          await tx.insert(stockMovements).values({
            variantId,
            delta: quantity,
            reason: "restock",
            adminUserId,
            note: "Starting stock",
          });
        }

        created.push(variant!);
        sortOrder++;
      }
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.generateVariantMatrix",
      entityType: "product",
      entityId: input.productId,
      after: {
        created: created.map((v) => ({ id: v.id, sku: v.sku })),
        skipped,
        startingStock: input.startingStock ?? [],
      },
    });

    return {
      result: { created, skipped },
      revalidateTags: tagsForProductMutation(input.productId, product.categoryId),
    };
  });
}

/**
 * Deletes one size & colour that has never been ordered, with its stock and
 * stock history (rows cascade). Refused if any order line points at it — it
 * can only be paused then — or while units are held in a checkout, which
 * would otherwise vanish mid-payment.
 */
export async function deleteVariant(
  variantId: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ id: string }>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
    });
    if (!before) throw new NotFoundError(`Variant ${variantId}`);
    const label = `${before.size} / ${before.color}`;

    const [{ orderLines }] = await tx
      .select({ orderLines: count() })
      .from(orderItems)
      .where(eq(orderItems.variantId, variantId));
    if (orderLines > 0) {
      throw new VariantNotDeletableError(
        `${label} has been ordered, so it can't be deleted — pause it instead`,
      );
    }

    // Lock the stock row so a checkout can't start holding units mid-delete.
    const [stock] = await tx
      .select({ reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .for("update");
    if (stock && stock.reserved > 0) {
      throw new VariantNotDeletableError(
        `${label} has ${stock.reserved} in checkout right now — try again in a few minutes`,
      );
    }

    await tx.delete(productVariants).where(eq(productVariants.id, variantId));

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.deleteVariant",
      entityType: "product_variant",
      entityId: variantId,
      before,
    });

    const product = await tx.query.products.findFirst({
      where: eq(products.id, before.productId),
    });
    return {
      result: { id: variantId },
      revalidateTags: product
        ? tagsForProductMutation(before.productId, product.categoryId)
        : [productTag(before.productId)],
    };
  });
}

/**
 * Per-variant price override / active toggle (docs/07 §13 Products:
 * "per-variant price/stock") - the matrix generator only creates variants
 * at their default (inherited) price; this is the follow-up edit. Stock
 * itself is `inventory/admin.ts`'s `adjustStock`, a separate action with
 * its own required-reason contract, not this.
 */
export async function updateVariant(
  variantId: string,
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof productVariants.$inferSelect>> {
  const input: UpdateVariantInput = updateVariantInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
    });
    if (!before) throw new NotFoundError(`Variant ${variantId}`);

    const [after] = await tx
      .update(productVariants)
      .set(input)
      .where(eq(productVariants.id, variantId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.updateVariant",
      entityType: "product_variant",
      entityId: variantId,
      before,
      after,
    });

    const product = await tx.query.products.findFirst({ where: eq(products.id, before.productId) });
    return {
      result: after!,
      revalidateTags: product
        ? tagsForProductMutation(before.productId, product.categoryId)
        : [productTag(before.productId)],
    };
  });
}

export async function updateImageAlt(
  imageId: string,
  alt: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof productImages.$inferSelect>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.productImages.findFirst({ where: eq(productImages.id, imageId) });
    if (!before) throw new NotFoundError(`Product image ${imageId}`);

    const [after] = await tx
      .update(productImages)
      .set({ alt })
      .where(eq(productImages.id, imageId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.updateImageAlt",
      entityType: "product_image",
      entityId: imageId,
      before,
      after,
    });

    const product = await tx.query.products.findFirst({ where: eq(products.id, before.productId) });
    return {
      result: after!,
      revalidateTags: product
        ? tagsForProductMutation(before.productId, product.categoryId)
        : [productTag(before.productId)],
    };
  });
}

/** Sets sortOrder to match array position - the admin UI's drag-to-reorder for a product's images. */
export async function reorderImages(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ count: number }>> {
  const input: ReorderImagesInput = reorderImagesInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const images = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(
          eq(productImages.productId, input.productId),
          inArray(productImages.id, input.imageIdsInOrder),
        ),
      );
    if (images.length !== input.imageIdsInOrder.length) {
      throw new NotFoundError(`One or more images for product ${input.productId}`);
    }

    // The first photo is the main one: `isPrimary` must follow the order, or
    // the cart (which picks the thumbnail by `isPrimary`) keeps showing the
    // old first photo after a reorder.
    for (let i = 0; i < input.imageIdsInOrder.length; i++) {
      await tx
        .update(productImages)
        .set({ sortOrder: i, isPrimary: i === 0 })
        .where(eq(productImages.id, input.imageIdsInOrder[i]!));
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.reorderImages",
      entityType: "product",
      entityId: input.productId,
      after: { imageIdsInOrder: input.imageIdsInOrder },
    });

    const product = await tx.query.products.findFirst({ where: eq(products.id, input.productId) });
    return {
      result: { count: input.imageIdsInOrder.length },
      revalidateTags: product
        ? tagsForProductMutation(input.productId, product.categoryId)
        : [productTag(input.productId)],
    };
  });
}

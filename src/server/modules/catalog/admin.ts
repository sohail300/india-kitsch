import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  categories,
  inventory,
  productImages,
  products,
  productVariants,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
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
} from "./admin-schemas";
import {
  createCategoryInputSchema,
  createProductInputSchema,
  generateVariantMatrixInputSchema,
  reorderImagesInputSchema,
  updateCategoryInputSchema,
  updateProductInputSchema,
} from "./admin-schemas";

/**
 * Admin write-side of the catalog module — `catalog/service.ts` stays
 * customer-facing reads only (docs/02's module split). Every mutation
 * writes an `audit_log` row in the same transaction (docs/07 §13) and
 * returns which cache tags the caller (a Server Action, Phase 11) should
 * revalidate — this module never calls `revalidateTag` itself, since that
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
    if (input.parentId) {
      await assertUsableParent(tx, input.parentId);
    }

    const [category] = await tx
      .insert(categories)
      .values({ id: createId(), ...input })
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

    if (input.parentId) {
      if (input.parentId === categoryId) {
        throw new Error("updateCategory: a category cannot be its own parent");
      }
      await assertUsableParent(tx, input.parentId);
    }

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

/** A category already used as someone's parent can't itself be nested (1-level only, docs/03 §4). */
async function assertUsableParent(dbHandle: DbOrTx, parentId: string): Promise<void> {
  const parent = await dbHandle.query.categories.findFirst({ where: eq(categories.id, parentId) });
  if (!parent) throw new NotFoundError(`Category ${parentId}`);
  if (parent.parentId !== null) {
    throw new Error(
      `updateCategory/createCategory: ${parentId} is itself a child category — only 1-level nesting is allowed`,
    );
  }
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

/** Sets sortOrder to match array position — the admin UI's drag-to-reorder. */
export async function reorderCategories(
  orderedCategoryIds: string[],
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<{ count: number }>> {
  return dbHandle.transaction(async (tx) => {
    for (let i = 0; i < orderedCategoryIds.length; i++) {
      await tx
        .update(categories)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(categories.id, orderedCategoryIds[i]!));
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "category.reorder",
      entityType: "category",
      entityId: "bulk",
      after: { orderedCategoryIds },
    });

    return {
      result: { count: orderedCategoryIds.length },
      revalidateTags: [...new Set(orderedCategoryIds.flatMap((id) => tagsForCategoryMutation(id)))],
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

/**
 * sizes × colors → SKUs (docs/07 §13). Idempotent against re-running with
 * an overlapping matrix: a (size, color) pair that already exists for this
 * product is skipped, not duplicated or errored on — `unique(productId,
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

    for (const size of input.sizes) {
      for (const color of input.colors) {
        if (existingPairs.has(`${size}::${color.name}`)) {
          skipped.push({ size, color: color.name });
          continue;
        }

        const variantId = createId();
        const sku = `${input.skuPrefix}-${size}-${color.name}`
          .toUpperCase()
          .replace(/\s+/g, "-")
          .replace(/[^A-Z0-9-]/g, "");

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
        await tx.insert(inventory).values({ variantId, onHand: 0, reserved: 0 });

        created.push(variant!);
        sortOrder++;
      }
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.generateVariantMatrix",
      entityType: "product",
      entityId: input.productId,
      after: { created: created.map((v) => v.id), skipped },
    });

    return {
      result: { created, skipped },
      revalidateTags: tagsForProductMutation(input.productId, product.categoryId),
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

/** Sets sortOrder to match array position — the admin UI's drag-to-reorder for a product's images. */
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

    for (let i = 0; i < input.imageIdsInOrder.length; i++) {
      await tx
        .update(productImages)
        .set({ sortOrder: i })
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

"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import {
  createProduct,
  generateVariantMatrix,
  deleteProduct,
  deleteVariant,
  reorderImages,
  setProductStatus,
  updateImageAlt,
  updateProduct,
  updateVariant,
  type VariantMatrixResult,
} from "@/server/modules/catalog/admin";
import type { products, productImages, productVariants } from "@/server/db/schema";
import { createR2Client, deleteObject } from "@/server/modules/media/r2";
import { logger } from "@/server/lib/logger";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

type Product = typeof products.$inferSelect;
type Variant = typeof productVariants.$inferSelect;
type ProductImage = typeof productImages.$inferSelect;

function afterMutation(tags: string[]) {
  tags.forEach((tag) => updateTag(tag));
  revalidatePath("/admin/products");
}

export async function createProductAction(input: unknown): Promise<ActionResult<Product>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await createProduct(input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProductAction(
  productId: string,
  input: unknown,
): Promise<ActionResult<Product>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await updateProduct(productId, input, session.user.id);
    afterMutation(revalidateTags);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function setProductStatusAction(
  productId: string,
  status: Product["status"],
): Promise<ActionResult<Product>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await setProductStatus(productId, status, session.user.id);
    afterMutation(revalidateTags);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function generateVariantMatrixAction(
  input: unknown,
): Promise<ActionResult<VariantMatrixResult>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await generateVariantMatrix(input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateVariantAction(
  variantId: string,
  input: unknown,
): Promise<ActionResult<Variant>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await updateVariant(variantId, input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateImageAltAction(
  imageId: string,
  alt: string,
): Promise<ActionResult<ProductImage>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await updateImageAlt(imageId, alt, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function reorderImagesAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await reorderImages(input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProductAction(
  productId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await deleteProduct(productId, session.user.id);
    afterMutation(revalidateTags);
    // The database is the source of truth and has already committed; removing
    // the photo files is best-effort. Any left behind are orphans for the
    // planned orphan-image sweep (docs/07 §12 step 5), not broken data.
    const r2 = createR2Client();
    const results = await Promise.allSettled(result.imageKeys.map((key) => deleteObject(r2, key)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn("deleteProductAction: some photo files were not removed", { productId, failed });
    }
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteVariantAction(
  variantId: string,
  productId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await deleteVariant(variantId, session.user.id);
    afterMutation(revalidateTags);
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/inventory");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

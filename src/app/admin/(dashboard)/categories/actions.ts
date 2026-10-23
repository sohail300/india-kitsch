"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryActive,
  updateCategory,
} from "@/server/modules/catalog/admin";
import type { categories } from "@/server/db/schema";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

type Category = typeof categories.$inferSelect;

/**
 * `updateTag`, not `revalidateTag` - an admin change should be visible on
 * the very next read (this action's own response), which is what
 * `updateTag`'s immediate invalidation gives (Next's Server Actions guide,
 * "Choosing a cache update"). `revalidateTag`'s stale-while-revalidate
 * profile would show the *old* value in this same round trip.
 */
function afterMutation(tags: string[]) {
  tags.forEach((tag) => updateTag(tag));
  revalidatePath("/admin/categories");
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await deleteCategory(categoryId, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<Category>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await createCategory(input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryAction(
  categoryId: string,
  input: unknown,
): Promise<ActionResult<Category>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await updateCategory(categoryId, input, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function setCategoryActiveAction(
  categoryId: string,
  isActive: boolean,
): Promise<ActionResult<Category>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await setCategoryActive(
      categoryId,
      isActive,
      session.user.id,
    );
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function moveCategoryAction(
  orderedCategoryIds: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAdmin(await headers());
    const { result, revalidateTags } = await reorderCategories(orderedCategoryIds, session.user.id);
    afterMutation(revalidateTags);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

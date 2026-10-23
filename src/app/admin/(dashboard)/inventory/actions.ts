"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { adjustStock, type StockAdjustmentReason } from "@/server/modules/inventory/admin";
import type { inventory } from "@/server/db/schema";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

type Inventory = typeof inventory.$inferSelect;

export async function adjustStockAction(input: {
  variantId: string;
  delta: number;
  reason: StockAdjustmentReason;
  note?: string;
}): Promise<ActionResult<Inventory>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await adjustStock(input, session.user.id);
    revalidatePath("/admin/inventory");
    // Stock is also adjusted from a product's Sizes & colours list.
    revalidatePath("/admin/products", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { inventory, stockMovements } from "@/server/db/schema";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";

/** Reasons an admin can record by hand. `return` = returned outside an order (in-shop, courier). */
export const STOCK_ADJUSTMENT_REASONS = ["adjustment", "restock", "return"] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export interface AdjustStockInput {
  variantId: string;
  /** Signed - positive increases on_hand (e.g. a restock delivery), negative decreases it (e.g. damage, loss, a stocktake correction). */
  delta: number;
  reason: StockAdjustmentReason;
  /**
   * Optional free text. The required part of docs/03 §11's "required reason"
   * is `reason` (restock / return / adjustment) — every change is still categorised
   * and logged; the note just adds detail when the owner has any.
   */
  note?: string;
}

/**
 * The admin inline stock edit (docs/07 §13 "Inventory": "inline adjust
 * with reason, movement history"). Unlike reserve/release/sell
 * (inventory/service.ts, composable primitives for checkout's own
 * transaction), this is a standalone admin action: it opens its own
 * transaction, records who did it, and writes the audit log entry itself.
 */
export async function adjustStock(
  input: AdjustStockInput,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof inventory.$inferSelect>> {
  // Checked at runtime too: the reason comes from a form, and the movement
  // ledger must never get a system-only reason (reserve/release/sale).
  if (!(STOCK_ADJUSTMENT_REASONS as readonly string[]).includes(input.reason)) {
    throw new Error(`adjustStock: unsupported reason "${input.reason}"`);
  }
  if ((input.reason === "restock" || input.reason === "return") && input.delta < 0) {
    throw new Error(`adjustStock: "${input.reason}" can only increase stock`);
  }
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error(`adjustStock: delta must be a non-zero integer, got ${input.delta}`);
  }

  return dbHandle.transaction(async (tx) => {
    // (on_hand + delta) >= reserved covers both CHECK constraints at once:
    // it implies on_hand+delta >= 0 too, since reserved is itself always >= 0.
    const [updated] = await tx
      .update(inventory)
      .set({ onHand: sql`${inventory.onHand} + ${input.delta}`, updatedAt: new Date() })
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          sql`${inventory.onHand} + ${input.delta} >= ${inventory.reserved}`,
        ),
      )
      .returning();

    if (!updated) {
      throw new Error(
        `adjustStock: applying delta ${input.delta} to variant ${input.variantId} would leave on_hand below reserved (or below zero)`,
      );
    }

    await tx.insert(stockMovements).values({
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      adminUserId,
      note: input.note?.trim() || null,
    });

    await writeAuditLog(tx, {
      adminUserId,
      action: "inventory.adjust",
      entityType: "inventory",
      entityId: input.variantId,
      after: {
        delta: input.delta,
        reason: input.reason,
        note: input.note?.trim() || null,
        newOnHand: updated.onHand,
      },
    });

    return { result: updated, revalidateTags: [] };
  });
}

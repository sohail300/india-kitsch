import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { inventory, stockMovements } from "@/server/db/schema";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";

export type StockAdjustmentReason = "adjustment" | "restock";

export interface AdjustStockInput {
  variantId: string;
  /** Signed — positive increases on_hand (e.g. a restock delivery), negative decreases it (e.g. damage, loss, a stocktake correction). */
  delta: number;
  reason: StockAdjustmentReason;
  /** Required — docs/03 §11: "inline stock edit writes an adjustment movement with a required reason." */
  note: string;
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
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error(`adjustStock: delta must be a non-zero integer, got ${input.delta}`);
  }
  if (input.note.trim().length === 0) {
    throw new Error("adjustStock: note is required");
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
      note: input.note,
    });

    await writeAuditLog(tx, {
      adminUserId,
      action: "inventory.adjust",
      entityType: "inventory",
      entityId: input.variantId,
      after: {
        delta: input.delta,
        reason: input.reason,
        note: input.note,
        newOnHand: updated.onHand,
      },
    });

    return { result: updated, revalidateTags: [] };
  });
}

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { inventory, stockMovements } from "@/server/db/schema";
import { OutOfStockError } from "@/server/lib/errors";

/**
 * Stock reservation — docs/03 §11. Both functions take the *caller's*
 * transaction rather than opening their own, so they compose into a larger
 * transaction (e.g. checkout's order-creation transaction reserves stock,
 * inserts the order and items, and applies a coupon all atomically).
 */

export interface StockLine {
  variantId: string;
  quantity: number;
}

export interface MovementContext {
  orderId?: string;
  note?: string;
}

/**
 * A fixed lock order (ascending variantId) across every caller prevents
 * deadlocks between overlapping multi-line carts that touch the same two
 * variants in opposite order (docs/03 §11).
 */
function sortedByVariantId<T extends StockLine>(lines: T[]): T[] {
  return [...lines].sort((a, b) =>
    a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
  );
}

function assertPositiveQuantity(line: StockLine, fn: string): void {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new Error(
      `${fn}: quantity must be a positive integer, got ${line.quantity} for variant ${line.variantId}`,
    );
  }
}

/**
 * Reserves stock for each line inside the caller's transaction. Each line is
 * one conditional UPDATE that only succeeds if enough stock is available
 * right now. Under Postgres's default READ COMMITTED, a second concurrent
 * UPDATE on the same row waits for the first's row lock and then
 * re-evaluates its own WHERE clause against the post-update row, so two
 * buyers of the last unit can never both succeed — no application-level
 * locking needed.
 *
 * Throws OutOfStockError on the first line that can't be reserved, which
 * rolls back the whole transaction (including any earlier lines this same
 * call already reserved) — the caller decides what to do next, this
 * function never partially reserves a multi-line cart.
 */
export async function reserveStock(
  tx: Tx,
  lines: StockLine[],
  context: MovementContext = {},
): Promise<void> {
  for (const line of sortedByVariantId(lines)) {
    assertPositiveQuantity(line, "reserveStock");

    const updated = await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} + ${line.quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(inventory.variantId, line.variantId),
          sql`${inventory.onHand} - ${inventory.reserved} >= ${line.quantity}`,
        ),
      )
      .returning({ variantId: inventory.variantId });

    if (updated.length === 0) {
      throw new OutOfStockError(line.variantId);
    }

    await tx.insert(stockMovements).values({
      variantId: line.variantId,
      delta: line.quantity,
      reason: "reserve",
      orderId: context.orderId,
      note: context.note,
    });
  }
}

/**
 * Releases a previously made reservation (order cancel/expiry). The `CHECK
 * (reserved >= 0)` constraint makes `reserved` going negative impossible on
 * a healthy DB, but the WHERE clause still guards against a caller bug
 * releasing more than is actually reserved, surfacing it as a thrown error
 * instead of a silently wrong ledger.
 */
export async function releaseStock(
  tx: Tx,
  lines: StockLine[],
  context: MovementContext = {},
): Promise<void> {
  for (const line of sortedByVariantId(lines)) {
    assertPositiveQuantity(line, "releaseStock");

    const updated = await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} - ${line.quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(inventory.variantId, line.variantId),
          sql`${inventory.reserved} >= ${line.quantity}`,
        ),
      )
      .returning({ variantId: inventory.variantId });

    if (updated.length === 0) {
      throw new Error(
        `releaseStock: cannot release ${line.quantity} for variant ${line.variantId} — reserved is lower than that`,
      );
    }

    await tx.insert(stockMovements).values({
      variantId: line.variantId,
      delta: -line.quantity,
      reason: "release",
      orderId: context.orderId,
      note: context.note,
    });
  }
}

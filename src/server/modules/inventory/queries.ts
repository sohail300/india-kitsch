import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { inventory } from "@/server/db/schema";

export interface VariantAvailability {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
}

/**
 * Live per-variant availability, keyed by variantId. Used to decorate
 * otherwise-cached catalog reads with fresh stock info (docs/05 §7:
 * "cached HTML never lies about stock") - never itself cached.
 *
 * `dbHandle` defaults to the real `db` singleton; integration tests pass a
 * handle bound to TEST_DATABASE_URL instead (docs/09 §20).
 */
export async function getAvailability(
  variantIds: string[],
  dbHandle: DbOrTx = db,
): Promise<Map<string, VariantAvailability>> {
  if (variantIds.length === 0) return new Map();

  const rows = await dbHandle
    .select()
    .from(inventory)
    .where(inArray(inventory.variantId, variantIds));

  return new Map(
    rows.map((row) => [
      row.variantId,
      {
        variantId: row.variantId,
        onHand: row.onHand,
        reserved: row.reserved,
        available: row.onHand - row.reserved,
      },
    ]),
  );
}

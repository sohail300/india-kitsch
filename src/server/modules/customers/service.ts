import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";

/**
 * Disabling blocks sign-in going forward, checked live on every request
 * (`requireUser`, docs/04 §5) — it doesn't touch existing sessions or
 * orders, and re-enabling is symmetric (docs/07 §13: "disable account").
 */
export async function setCustomerDisabled(
  userId: string,
  disabled: boolean,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof user.$inferSelect>> {
  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.user.findFirst({ where: eq(user.id, userId) });
    if (!before) throw new NotFoundError(`Customer ${userId}`);

    const [after] = await tx.update(user).set({ disabled }).where(eq(user.id, userId)).returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: disabled ? "customer.disable" : "customer.enable",
      entityType: "user",
      entityId: userId,
      before: { disabled: before.disabled },
      after: { disabled: after!.disabled },
    });

    return { result: after!, revalidateTags: [] };
  });
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { session, user } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";

/**
 * Disabling blocks sign-in (the session-create hook in auth/config.ts) and
 * signs the customer out everywhere by deleting their sessions; `requireUser`
 * (docs/04 §5) also re-checks `disabled` on every request as a backstop.
 * Orders are untouched, and re-enabling just lets them sign in again
 * (docs/07 §13: "disable account").
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
    if (disabled) await tx.delete(session).where(eq(session.userId, userId));

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

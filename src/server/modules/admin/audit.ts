import "server-only";
import type { Tx } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

export interface AuditLogInput {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * An `audit_log` row per admin mutation (docs/07 §13). Always called inside
 * the same transaction as the mutation it's recording, never after - an
 * audit entry that describes a change which didn't actually commit would
 * be worse than no entry at all.
 */
export async function writeAuditLog(tx: Tx, input: AuditLogInput): Promise<void> {
  await tx.insert(auditLog).values({
    adminUserId: input.adminUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { coupons } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";
import { createCouponInputSchema, updateCouponInputSchema } from "./admin-schemas";

export async function createCoupon(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof coupons.$inferSelect>> {
  const input = createCouponInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const [coupon] = await tx
      .insert(coupons)
      .values({
        id: createId(),
        code: input.code,
        type: input.type,
        valueBps: input.type === "percent" ? input.valueBps : null,
        valuePaise: input.type === "fixed" ? input.valuePaise : null,
        minSubtotalPaise: input.minSubtotalPaise,
        maxDiscountPaise: input.maxDiscountPaise,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxUses: input.maxUses,
        perUserLimit: input.perUserLimit,
        isActive: input.isActive,
        createdByAdminId: adminUserId,
      })
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "coupon.create",
      entityType: "coupon",
      entityId: coupon!.id,
      after: coupon,
    });

    return { result: coupon!, revalidateTags: [] };
  });
}

export async function updateCoupon(
  couponId: string,
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof coupons.$inferSelect>> {
  const input = updateCouponInputSchema.parse(rawInput);

  return dbHandle.transaction(async (tx) => {
    const before = await tx.query.coupons.findFirst({ where: eq(coupons.id, couponId) });
    if (!before) throw new NotFoundError(`Coupon ${couponId}`);

    const [after] = await tx
      .update(coupons)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(coupons.id, couponId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "coupon.update",
      entityType: "coupon",
      entityId: couponId,
      before,
      after,
    });

    return { result: after!, revalidateTags: [] };
  });
}

export async function setCouponActive(
  couponId: string,
  isActive: boolean,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<typeof coupons.$inferSelect>> {
  return updateCoupon(couponId, { isActive }, adminUserId, dbHandle);
}

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { createCoupon, setCouponActive, updateCoupon } from "@/server/modules/coupons/admin";
import type { coupons } from "@/server/db/schema";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

type Coupon = typeof coupons.$inferSelect;

export async function createCouponAction(input: unknown): Promise<ActionResult<Coupon>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await createCoupon(input, session.user.id);
    revalidatePath("/admin/coupons");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCouponAction(
  couponId: string,
  input: unknown,
): Promise<ActionResult<Coupon>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await updateCoupon(couponId, input, session.user.id);
    revalidatePath("/admin/coupons");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function setCouponActiveAction(
  couponId: string,
  isActive: boolean,
): Promise<ActionResult<Coupon>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await setCouponActive(couponId, isActive, session.user.id);
    revalidatePath("/admin/coupons");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

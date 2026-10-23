"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { setCustomerDisabled } from "@/server/modules/customers/service";
import type { user } from "@/server/db/schema";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

type Customer = typeof user.$inferSelect;

export async function setCustomerDisabledAction(
  customerId: string,
  disabled: boolean,
): Promise<ActionResult<Customer>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await setCustomerDisabled(customerId, disabled, session.user.id);
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

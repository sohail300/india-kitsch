"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import {
  updateCatalogSettings,
  updateShippingSettings,
  updateStoreInfo,
} from "@/server/modules/settings/admin";
import type {
  CatalogSettingsValue,
  ShippingSettingsValue,
  StoreInfoValue,
} from "@/server/modules/settings/schemas";
import { actionError, type ActionResult } from "@/app/admin/_lib/action-result";

export async function updateShippingSettingsAction(
  input: ShippingSettingsValue,
): Promise<ActionResult<ShippingSettingsValue>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await updateShippingSettings(input, session.user.id);
    revalidatePath("/admin/settings");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateStoreInfoAction(
  input: StoreInfoValue,
): Promise<ActionResult<StoreInfoValue>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await updateStoreInfo(input, session.user.id);
    revalidatePath("/admin/settings");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCatalogSettingsAction(
  input: CatalogSettingsValue,
): Promise<ActionResult<CatalogSettingsValue>> {
  try {
    const session = await requireAdmin(await headers());
    const { result } = await updateCatalogSettings(input, session.user.id);
    // The low-stock level feeds the dashboard and Inventory too.
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/inventory");
    return { ok: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

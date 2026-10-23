import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db, Tx } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";
import type { CatalogSettingsValue, ShippingSettingsValue, StoreInfoValue } from "./schemas";
import {
  CATALOG_SETTINGS_KEY,
  catalogSettingsSchema,
  SHIPPING_SETTINGS_KEY,
  STORE_INFO_SETTINGS_KEY,
  shippingSettingsSchema,
  storeInfoInputSchema,
} from "./schemas";

async function upsertSetting(
  tx: Tx,
  key: string,
  value: unknown,
  adminUserId: string,
): Promise<typeof storeSettings.$inferSelect> {
  const before = await tx.query.storeSettings.findFirst({ where: eq(storeSettings.key, key) });

  const [after] = await tx
    .insert(storeSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: storeSettings.key, set: { value, updatedAt: new Date() } })
    .returning();

  await writeAuditLog(tx, {
    adminUserId,
    action: "settings.update",
    entityType: "store_settings",
    entityId: key,
    before: before?.value,
    after: value,
  });

  return after!;
}

export async function updateShippingSettings(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<ShippingSettingsValue>> {
  const input = shippingSettingsSchema.parse(rawInput);
  return dbHandle.transaction(async (tx) => {
    await upsertSetting(tx, SHIPPING_SETTINGS_KEY, input, adminUserId);
    return { result: input, revalidateTags: [] };
  });
}

export async function updateStoreInfo(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<StoreInfoValue>> {
  // The stricter write-time rules (GSTIN/phone/pincode/social formats).
  const input = storeInfoInputSchema.parse(rawInput);
  return dbHandle.transaction(async (tx) => {
    await upsertSetting(tx, STORE_INFO_SETTINGS_KEY, input, adminUserId);
    return { result: input, revalidateTags: [] };
  });
}

export async function updateCatalogSettings(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<CatalogSettingsValue>> {
  const input = catalogSettingsSchema.parse(rawInput);
  return dbHandle.transaction(async (tx) => {
    await upsertSetting(tx, CATALOG_SETTINGS_KEY, input, adminUserId);
    return { result: input, revalidateTags: [] };
  });
}

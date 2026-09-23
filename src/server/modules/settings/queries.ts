import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { storeSettings } from "@/server/db/schema";
import type { ShippingSettingsValue, StoreInfoValue } from "./schemas";
import {
  PLACEHOLDER_SHIPPING_SETTINGS,
  PLACEHOLDER_STORE_INFO,
  SHIPPING_SETTINGS_KEY,
  STORE_INFO_SETTINGS_KEY,
  shippingSettingsSchema,
  storeInfoSchema,
} from "./schemas";

/**
 * Falls back to a clearly-labelled placeholder (docs/11 §29 #5) if the
 * admin hasn't set real shipping numbers yet, rather than failing checkout
 * outright — a missing setting is a business decision that isn't made yet,
 * not a bug.
 */
export async function getShippingSettings(dbHandle: DbOrTx = db): Promise<ShippingSettingsValue> {
  const row = await dbHandle.query.storeSettings.findFirst({
    where: eq(storeSettings.key, SHIPPING_SETTINGS_KEY),
  });
  if (!row) return PLACEHOLDER_SHIPPING_SETTINGS;

  const parsed = shippingSettingsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : PLACEHOLDER_SHIPPING_SETTINGS;
}

export async function getStoreInfo(dbHandle: DbOrTx = db): Promise<StoreInfoValue> {
  const row = await dbHandle.query.storeSettings.findFirst({
    where: eq(storeSettings.key, STORE_INFO_SETTINGS_KEY),
  });
  if (!row) return PLACEHOLDER_STORE_INFO;

  const parsed = storeInfoSchema.safeParse(row.value);
  return parsed.success ? parsed.data : PLACEHOLDER_STORE_INFO;
}

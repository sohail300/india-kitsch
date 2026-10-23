import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { auditLog, storeSettings, user } from "@/server/db/schema";
import type { CatalogSettingsValue, ShippingSettingsValue, StoreInfoValue } from "./schemas";
import {
  CATALOG_SETTINGS_KEY,
  catalogSettingsSchema,
  DEFAULT_CATALOG_SETTINGS,
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
 * outright - a missing setting is a business decision that isn't made yet,
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

export async function getCatalogSettings(dbHandle: DbOrTx = db): Promise<CatalogSettingsValue> {
  const row = await dbHandle.query.storeSettings.findFirst({
    where: eq(storeSettings.key, CATALOG_SETTINGS_KEY),
  });
  if (!row) return DEFAULT_CATALOG_SETTINGS;

  const parsed = catalogSettingsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : DEFAULT_CATALOG_SETTINGS;
}

export interface SettingUpdateInfo {
  adminEmail: string;
  at: Date;
}

/**
 * Who last saved each settings key and when, read back from the audit log
 * (`upsertSetting` writes a `settings.update` row in the same transaction).
 * Keys never saved are simply absent.
 */
export async function getSettingsLastUpdated(
  keys: string[],
  dbHandle: DbOrTx = db,
): Promise<Record<string, SettingUpdateInfo>> {
  const rows = await dbHandle
    .select({ key: auditLog.entityId, adminEmail: user.email, at: auditLog.createdAt })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.adminUserId))
    .where(
      and(
        eq(auditLog.action, "settings.update"),
        eq(auditLog.entityType, "store_settings"),
        inArray(auditLog.entityId, keys),
      ),
    )
    .orderBy(desc(auditLog.createdAt));

  const latest: Record<string, SettingUpdateInfo> = {};
  for (const row of rows) {
    latest[row.key] ??= { adminEmail: row.adminEmail, at: row.at };
  }
  return latest;
}

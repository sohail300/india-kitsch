import type { Metadata } from "next";
import {
  getCatalogSettings,
  getSettingsLastUpdated,
  getShippingSettings,
  getStoreInfo,
  type SettingUpdateInfo,
} from "@/server/modules/settings/queries";
import {
  CATALOG_SETTINGS_KEY,
  SHIPPING_SETTINGS_KEY,
  STORE_INFO_SETTINGS_KEY,
} from "@/server/modules/settings/schemas";
import { PageHeader } from "@/app/admin/_components/page-header";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { CatalogSettingsForm } from "./catalog-settings-form";
import { ShippingSettingsForm } from "./shipping-settings-form";
import { StoreInfoForm } from "./store-info-form";

export const metadata: Metadata = { title: "Settings - India Kitsch Admin" };

/** "by owner@… · Sep 25, 2026 · 3:40 pm" — formatted here, on the server, in store time. */
function lastUpdatedLabel(info: SettingUpdateInfo | undefined): string | undefined {
  return info ? `by ${info.adminEmail} · ${formatAdminDateTime(info.at)}` : undefined;
}

export default async function SettingsPage() {
  const [shipping, storeInfo, catalog, lastUpdated] = await Promise.all([
    getShippingSettings(),
    getStoreInfo(),
    getCatalogSettings(),
    getSettingsLastUpdated([SHIPPING_SETTINGS_KEY, STORE_INFO_SETTINGS_KEY, CATALOG_SETTINGS_KEY]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Store settings" />
      {/* Capped width: without it, the label/fields ratio below is computed
          against the full (often very wide) content area, leaving a large
          empty stripe to the right of every input - real settings pages
          (Stripe, GitHub, Linear) never go full-bleed for the same reason. */}
      <div className="max-w-3xl divide-y divide-border">
        <ShippingSettingsForm
          initial={shipping}
          lastUpdated={lastUpdatedLabel(lastUpdated[SHIPPING_SETTINGS_KEY])}
        />
        <CatalogSettingsForm
          initial={catalog}
          lastUpdated={lastUpdatedLabel(lastUpdated[CATALOG_SETTINGS_KEY])}
        />
        <StoreInfoForm
          initial={storeInfo}
          lastUpdated={lastUpdatedLabel(lastUpdated[STORE_INFO_SETTINGS_KEY])}
        />
      </div>
    </div>
  );
}

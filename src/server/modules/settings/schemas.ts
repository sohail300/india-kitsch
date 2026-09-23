import { z } from "zod";

export const shippingSettingsSchema = z.object({
  feePaise: z.number().int().nonnegative(),
  /** null = never free, regardless of subtotal. */
  freeThresholdPaise: z.number().int().nonnegative().nullable(),
});

export type ShippingSettingsValue = z.infer<typeof shippingSettingsSchema>;

export const SHIPPING_SETTINGS_KEY = "shipping";

/**
 * PLACEHOLDER values — docs/11 §29 #5: real shipping fee/free-threshold
 * numbers are not yet decided by the owner. These exist only so pricing
 * math is exercisable now; they **must** be replaced with real numbers (an
 * admin settings write, not a code change) before Phase 6 goes live.
 */
export const PLACEHOLDER_SHIPPING_SETTINGS: ShippingSettingsValue = {
  feePaise: 9900,
  freeThresholdPaise: 299900,
};

export const storeInfoSchema = z.object({
  // Intentionally optional, not a placeholder to replace — the business is
  // confirmed not GST-registered (docs/11 §29 #3: "No GSTIN"). Leave blank
  // rather than fabricate one; tax.ts and invoices must handle that blank.
  gstin: z.string().trim().max(20).optional(),
  sellerState: z.string().trim().min(1).max(100),
  contactEmail: z.email(),
  contactPhone: z.string().trim().min(1).max(20).optional(),
});
export type StoreInfoValue = z.infer<typeof storeInfoSchema>;

export const STORE_INFO_SETTINGS_KEY = "storeInfo";

/** PLACEHOLDER — real seller state/contact details not yet provided by the owner. */
export const PLACEHOLDER_STORE_INFO: StoreInfoValue = {
  sellerState: "Maharashtra",
  contactEmail: "hello@example.com",
};

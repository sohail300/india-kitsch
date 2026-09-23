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

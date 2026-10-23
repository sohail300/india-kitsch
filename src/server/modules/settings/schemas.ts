import { z } from "zod";

export const shippingSettingsSchema = z.object({
  feePaise: z.number().int().nonnegative(),
  /** null = never free, regardless of subtotal. */
  freeThresholdPaise: z.number().int().nonnegative().nullable(),
});

export type ShippingSettingsValue = z.infer<typeof shippingSettingsSchema>;

export const SHIPPING_SETTINGS_KEY = "shipping";

/**
 * PLACEHOLDER values - docs/11 §29 #5: real shipping fee/free-threshold
 * numbers are not yet decided by the owner. These exist only so pricing
 * math is exercisable now; they **must** be replaced with real numbers (an
 * admin settings write, not a code change) before Phase 6 goes live.
 */
export const PLACEHOLDER_SHIPPING_SETTINGS: ShippingSettingsValue = {
  feePaise: 9900,
  freeThresholdPaise: 299900,
};

export const storeInfoSchema = z.object({
  // Intentionally optional, not a placeholder to replace - the business is
  // confirmed not GST-registered (docs/11 §29 #3: "No GSTIN"). Leave blank
  // rather than fabricate one; tax.ts and invoices must handle that blank.
  gstin: z.string().trim().max(20).optional(),
  sellerState: z.string().trim().min(1).max(100),
  contactEmail: z.email(),
  contactPhone: z.string().trim().min(1).max(20).optional(),
  // Postal address + social links - shown in the order-email footer when
  // set (never fabricated: absent until the owner actually fills these in).
  addressLine1: z.string().trim().min(1).max(200).optional(),
  addressLine2: z.string().trim().min(1).max(200).optional(),
  addressCity: z.string().trim().min(1).max(100).optional(),
  addressPincode: z.string().trim().min(1).max(20).optional(),
  instagramUrl: z.url().optional(),
  facebookUrl: z.url().optional(),
});
export type StoreInfoValue = z.infer<typeof storeInfoSchema>;

export const STORE_INFO_SETTINGS_KEY = "storeInfo";

/** PLACEHOLDER - real seller state/contact details not yet provided by the owner. */
export const PLACEHOLDER_STORE_INFO: StoreInfoValue = {
  sellerState: "Maharashtra",
  contactEmail: "hello@example.com",
};

// ---------------------------------------------------------------------------
// Field rules for saving store info. Shared with the admin form so the
// browser and the server agree. Enforced on **write only**
// (`storeInfoInputSchema`): reads keep the lenient `storeInfoSchema`, so a
// value saved before these rules existed still loads instead of silently
// falling back to the placeholder.
// ---------------------------------------------------------------------------

/** 15-character GSTIN: 2-digit state code, PAN, entity number, "Z", checksum. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Indian PIN code: 6 digits, not starting with 0. */
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
/** Indian mobile, optionally +91, after spaces/dashes are removed. */
export const PHONE_PATTERN = /^(\+91)?[6-9][0-9]{9}$/;

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/** A full https URL on the given site (or a subdomain of it, e.g. www.). */
export function isUrlOnSite(value: string, site: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && (url.hostname === site || url.hostname.endsWith(`.${site}`))
    );
  } catch {
    return false;
  }
}

export const storeInfoInputSchema = storeInfoSchema.extend({
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_PATTERN, "Enter a valid 15-character GSTIN")
    .optional(),
  contactPhone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .pipe(z.string().regex(PHONE_PATTERN, "Enter a 10-digit mobile number"))
    .optional(),
  addressPincode: z.string().trim().regex(PINCODE_PATTERN, "Enter a 6-digit pincode").optional(),
  instagramUrl: z
    .string()
    .trim()
    .refine((v) => isUrlOnSite(v, "instagram.com"), "Enter an https://instagram.com/… link")
    .optional(),
  facebookUrl: z
    .string()
    .trim()
    .refine((v) => isUrlOnSite(v, "facebook.com"), "Enter an https://facebook.com/… link")
    .optional(),
});

// ---------------------------------------------------------------------------
// Products & stock settings
// ---------------------------------------------------------------------------

export const catalogSettingsSchema = z.object({
  /** Pre-filled GST rate on new products, in basis points (1800 = 18%). */
  defaultGstRateBps: z.number().int().min(0).max(2800),
  /** "Low stock" means available <= this — dashboard card and Inventory filter. */
  lowStockThreshold: z.number().int().min(0).max(1000),
});
export type CatalogSettingsValue = z.infer<typeof catalogSettingsSchema>;

export const CATALOG_SETTINGS_KEY = "catalog";

/**
 * Defaults until the owner saves their own. The GST figure is a placeholder:
 * the business isn't GST-registered (docs/11 §29 #3) — confirm the right
 * treatment with a CA before relying on it.
 */
export const DEFAULT_CATALOG_SETTINGS: CatalogSettingsValue = {
  defaultGstRateBps: 1800,
  lowStockThreshold: 5,
};

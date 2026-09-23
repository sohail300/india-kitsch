import { z } from "zod";

/** Coupons are stored uppercase (DB `CHECK`, docs/03 §4) — normalize here so callers never have to remember to. */
export const couponCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((code) => code.toUpperCase());

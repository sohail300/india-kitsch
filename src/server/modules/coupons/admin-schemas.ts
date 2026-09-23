import { z } from "zod";

const baseCouponFields = {
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((c) => c.toUpperCase()),
  minSubtotalPaise: z.number().int().nonnegative().default(0),
  maxDiscountPaise: z.number().int().positive().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  maxUses: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
};

export const createCouponInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("percent"),
      valueBps: z.number().int().positive().max(10_000),
      ...baseCouponFields,
    }),
    z.object({
      type: z.literal("fixed"),
      valuePaise: z.number().int().positive(),
      ...baseCouponFields,
    }),
  ])
  .refine((input) => !input.startsAt || !input.endsAt || input.startsAt < input.endsAt, {
    message: "startsAt must be before endsAt",
    path: ["endsAt"],
  });
export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;

export const updateCouponInputSchema = z
  .object({
    minSubtotalPaise: z.number().int().nonnegative().optional(),
    maxDiscountPaise: z.number().int().positive().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    // A coupon's type/value are deliberately not editable once created —
    // change the discount by deactivating and creating a new code instead,
    // so a coupon already applied to a pending order never silently changes value.
  })
  .refine((input) => !input.startsAt || !input.endsAt || input.startsAt < input.endsAt, {
    message: "startsAt must be before endsAt",
    path: ["endsAt"],
  });
export type UpdateCouponInput = z.infer<typeof updateCouponInputSchema>;

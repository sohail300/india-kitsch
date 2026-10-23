import { z } from "zod";

export const createOrderLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const createOrderInputSchema = z.object({
  lines: z.array(createOrderLineSchema).min(1).max(50),
  addressId: z.string().min(1),
  couponCode: z.string().trim().min(1).max(40).optional(),
  /** Client-generated, unique per user (docs/03 §4) - makes a double-click return the same order instead of creating a duplicate. */
  idempotencyKey: z.string().min(1).max(100),
  /** Optimistic staleness check only - the server always recomputes the real total; a mismatch here just changes the response's `code`, never the amount actually charged. */
  expectedTotalPaise: z.number().int().nonnegative().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

import { z } from "zod";

export const CUSTOMERS_PAGE_SIZE = 25;

export const listCustomersInputSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type ListCustomersInput = z.infer<typeof listCustomersInputSchema>;

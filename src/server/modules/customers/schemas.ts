import { z } from "zod";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";

export const CUSTOMERS_PAGE_SIZE = ADMIN_PAGE_SIZE;

/** Sortable list columns, each with the direction it starts in when first clicked. */
export const CUSTOMER_SORT_FIRST_DIRS = {
  name: "asc",
  email: "asc",
  joined: "desc",
  orders: "desc",
  spent: "desc",
  last_order: "desc",
} as const;
export type CustomerSortKey = keyof typeof CUSTOMER_SORT_FIRST_DIRS;
const SORT_KEYS = Object.keys(CUSTOMER_SORT_FIRST_DIRS) as [CustomerSortKey, ...CustomerSortKey[]];

export const listCustomersInputSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  sort: z.enum(SORT_KEYS).default("joined"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type ListCustomersInput = z.input<typeof listCustomersInputSchema>;

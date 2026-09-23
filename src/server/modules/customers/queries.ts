import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { addresses, orders, user } from "@/server/db/schema";
import type { ListCustomersInput } from "./schemas";
import { CUSTOMERS_PAGE_SIZE } from "./schemas";

export interface ListCustomersResult {
  items: (typeof user.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listCustomers(
  input: ListCustomersInput,
  dbHandle: DbOrTx = db,
): Promise<ListCustomersResult> {
  const where = input.q
    ? and(
        eq(user.role, "customer"),
        or(ilike(user.name, `%${input.q}%`), ilike(user.email, `%${input.q}%`)),
      )
    : eq(user.role, "customer");

  const [items, [{ count }]] = await Promise.all([
    dbHandle
      .select()
      .from(user)
      .where(where)
      .orderBy(sql`${user.createdAt} desc`)
      .limit(CUSTOMERS_PAGE_SIZE)
      .offset((input.page - 1) * CUSTOMERS_PAGE_SIZE),
    dbHandle
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(where),
  ]);

  return {
    items,
    total: count,
    page: input.page,
    pageSize: CUSTOMERS_PAGE_SIZE,
    totalPages: Math.ceil(count / CUSTOMERS_PAGE_SIZE),
  };
}

export interface CustomerDetail {
  customer: typeof user.$inferSelect;
  addresses: (typeof addresses.$inferSelect)[];
  orders: (typeof orders.$inferSelect)[];
}

/**
 * Detail view (docs/07 §13 "Customers": "detail (addresses, orders)").
 * Three plain queries rather than one relational `with` query — a
 * `dbHandle: DbOrTx` (the `Db | Tx` union every module in this app uses for
 * testability) loses its `with`-relations type inference on `findFirst`
 * for this particular shape; three simple `select`s sidestep it entirely
 * and are just as fast for a single customer.
 */
export async function getCustomerDetail(
  userId: string,
  dbHandle: DbOrTx = db,
): Promise<CustomerDetail | null> {
  const [customer] = await dbHandle.select().from(user).where(eq(user.id, userId));
  if (!customer) return null;

  const [customerAddresses, customerOrders] = await Promise.all([
    dbHandle.select().from(addresses).where(eq(addresses.userId, userId)),
    dbHandle
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(20),
  ]);

  return { customer, addresses: customerAddresses, orders: customerOrders };
}

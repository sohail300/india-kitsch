import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { addresses, auditLog, orders, user } from "@/server/db/schema";
import type { CustomerSortKey, ListCustomersInput } from "./schemas";
import { CUSTOMERS_PAGE_SIZE, listCustomersInputSchema } from "./schemas";

export interface CustomerListItem {
  customer: typeof user.$inferSelect;
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: Date | null;
}

export interface ListCustomersResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Per-customer order stats, counting only orders that were actually paid
 * (`paid_at` set) - abandoned or unpaid checkouts aren't real orders.
 * Spend is net of refunds. Aggregated in SQL so the list can sort and page
 * on these columns without loading every order.
 */
function orderStatsSubquery(dbHandle: DbOrTx) {
  return dbHandle
    .select({
      userId: orders.userId,
      orderCount: sql<number>`count(*)::int`.as("order_count"),
      // bigint: a customer's lifetime spend can outgrow int4 paise.
      totalSpentPaise: sql<number>`sum(${orders.totalPaise} - ${orders.refundedPaise})::bigint`
        .mapWith(Number)
        .as("total_spent_paise"),
      lastOrderAt: sql<Date>`max(${orders.createdAt})`
        .mapWith(orders.createdAt)
        .as("last_order_at"),
    })
    .from(orders)
    .where(isNotNull(orders.paidAt))
    .groupBy(orders.userId)
    .as("order_stats");
}

export async function listCustomers(
  rawInput: ListCustomersInput,
  dbHandle: DbOrTx = db,
): Promise<ListCustomersResult> {
  const input = listCustomersInputSchema.parse(rawInput);

  const where = and(
    eq(user.role, "customer"),
    input.q ? or(ilike(user.name, `%${input.q}%`), ilike(user.email, `%${input.q}%`)) : undefined,
    input.status ? eq(user.disabled, input.status === "disabled") : undefined,
  );

  const stats = orderStatsSubquery(dbHandle);
  // Customers with no paid orders have no stats row: counts sort as 0, and
  // a missing last-order date always sorts last.
  const sortExpressions: Record<CustomerSortKey, SQL | AnyColumn> = {
    name: user.name,
    email: user.email,
    joined: user.createdAt,
    orders: sql`coalesce(${stats.orderCount}, 0)`,
    spent: sql`coalesce(${stats.totalSpentPaise}, 0)`,
    last_order: sql`${stats.lastOrderAt}`,
  };
  const dir = sql.raw(input.dir === "asc" ? "asc" : "desc");

  const [rows, [{ count }]] = await Promise.all([
    dbHandle
      .select({
        customer: user,
        orderCount: stats.orderCount,
        totalSpentPaise: stats.totalSpentPaise,
        lastOrderAt: stats.lastOrderAt,
      })
      .from(user)
      .leftJoin(stats, eq(stats.userId, user.id))
      .where(where)
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(sql`${sortExpressions[input.sort]} ${dir} nulls last`, asc(user.id))
      .limit(CUSTOMERS_PAGE_SIZE)
      .offset((input.page - 1) * CUSTOMERS_PAGE_SIZE),
    dbHandle
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({
      customer: r.customer,
      orderCount: r.orderCount ?? 0,
      totalSpentPaise: r.totalSpentPaise ?? 0,
      lastOrderAt: r.lastOrderAt ?? null,
    })),
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
  /** Who disabled the account and when - only set while it's disabled. */
  disabledBy: { adminEmail: string; at: Date } | null;
}

/**
 * Detail view (docs/07 §13 "Customers": "detail (addresses, orders)").
 * Three plain queries rather than one relational `with` query - a
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

  // Read back from the audit trail (setCustomerDisabled writes a
  // `customer.disable` row in the same transaction as the change).
  let disabledBy: CustomerDetail["disabledBy"] = null;
  if (customer.disabled) {
    const [entry] = await dbHandle
      .select({ adminEmail: user.email, at: auditLog.createdAt })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.adminUserId))
      .where(
        and(
          eq(auditLog.action, "customer.disable"),
          eq(auditLog.entityType, "user"),
          eq(auditLog.entityId, userId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    disabledBy = entry ?? null;
  }

  return { customer, addresses: customerAddresses, orders: customerOrders, disabledBy };
}

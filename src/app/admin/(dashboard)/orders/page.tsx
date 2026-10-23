import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { SearchIcon, ShoppingCartIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { qualified } from "@/server/db/sql-helpers";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { orderItems, orders } from "@/server/db/schema";
import { formatINR } from "@/server/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { AdminPagination } from "@/app/admin/_components/admin-pagination";
import { DataTable } from "@/app/admin/_components/data-table";
import { DateRangeField } from "@/app/admin/_components/date-range-field";
import {
  displayOrderStatus,
  ORDER_STATUS_LABEL,
  OrderStatusBadge,
} from "@/app/admin/_components/status-badge";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { endOfStoreDay, startOfStoreDay } from "@/app/admin/_lib/store-time";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";
import { OrderRowActions } from "./order-row-actions";

export const metadata: Metadata = { title: "Orders - India Kitsch Admin" };

type OrderStatus = (typeof orders.$inferSelect)["status"];

// Tabs in working order: the owner's daily job is "To process" (paid, not started).
// "not_paid" is a display status (see displayOrderStatus): expired, never-paid
// checkouts get their own tab instead of padding out Cancelled.
type StatusTab = "all" | OrderStatus | "not_paid";
const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "To process" },
  { value: "processing", label: ORDER_STATUS_LABEL.processing! },
  { value: "shipped", label: ORDER_STATUS_LABEL.shipped! },
  { value: "delivered", label: ORDER_STATUS_LABEL.delivered! },
  { value: "pending_payment", label: ORDER_STATUS_LABEL.pending_payment! },
  { value: "not_paid", label: ORDER_STATUS_LABEL.not_paid! },
  { value: "cancelled", label: ORDER_STATUS_LABEL.cancelled! },
  { value: "refunded", label: ORDER_STATUS_LABEL.refunded! },
];

const SORT_FIRST_DIRS = {
  date: "desc",
  order: "desc",
  total: "desc",
} as const satisfies Record<string, SortDir>;
type SortKey = keyof typeof SORT_FIRST_DIRS;
const DEFAULT_SORT: SortKey = "date";
const SORT_EXPRESSIONS: Record<SortKey, SQL> = {
  date: sql`${orders.createdAt}`,
  order: sql`${orders.orderNumber}`,
  total: sql`${orders.totalPaise}`,
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Same rule as displayOrderStatus, in SQL, for filtering and tab counts.
const isNotPaid = sql`(${orders.status} = 'cancelled' and ${orders.cancelReason} is not distinct from 'expired')`;
const displayStatusSql = sql<string>`case when ${isNotPaid} then 'not_paid' else ${orders.status}::text end`;

function statusCondition(tab: StatusTab): SQL | undefined {
  switch (tab) {
    // "All" = real orders: never-paid checkouts only appear under "Not paid".
    case "all":
      return sql`not ${isNotPaid}`;
    case "not_paid":
      return isNotPaid;
    case "cancelled":
      return and(eq(orders.status, "cancelled"), sql`not ${isNotPaid}`);
    default:
      return eq(orders.status, tab);
  }
}

// Pieces in the order (sum of quantities), for the Items column.
// The outer column is `qualified()` — see server/db/sql-helpers.ts.
const itemCount = sql<number>`(
  select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems}
  where ${orderItems.orderId} = ${qualified(orders.id)}
)`;

export default async function OrdersPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const status = STATUS_TABS.some((t) => t.value === searchParams.status)
    ? (searchParams.status as StatusTab)
    : "all";
  // Store-calendar days (IST), not `new Date("yyyy-MM-dd")`, which is UTC midnight.
  const from = searchParams.from && DAY_PATTERN.test(searchParams.from) ? searchParams.from : "";
  const to = searchParams.to && DAY_PATTERN.test(searchParams.to) ? searchParams.to : "";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);
  const isFiltered = q !== "" || from !== "" || to !== "" || status !== "all";

  const orderNumberQuery = q.replace(/^IK-?/i, "").trim();
  const orderNumber = /^\d+$/.test(orderNumberQuery) ? Number(orderNumberQuery) : undefined;

  // Everything except the status — the tab counts use this, so each tab
  // shows how many orders it would list with the current search and dates.
  const baseConditions = [
    from ? gte(orders.createdAt, startOfStoreDay(from)) : undefined,
    to ? lte(orders.createdAt, endOfStoreDay(to)) : undefined,
    q
      ? or(
          ilike(orders.customerEmail, `%${q}%`),
          ilike(orders.shipFullName, `%${q}%`),
          orderNumber !== undefined ? eq(orders.orderNumber, orderNumber) : undefined,
        )
      : undefined,
  ].filter((c) => c !== undefined);
  const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;
  const where = and(...baseConditions, statusCondition(status));
  // Validated to exactly asc/desc by parseSort before reaching SQL.
  const direction = sql.raw(dir === "asc" ? "asc" : "desc");

  const [rows, [{ total }], statusCounts] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalPaise: orders.totalPaise,
        createdAt: orders.createdAt,
        customerEmail: orders.customerEmail,
        shipFullName: orders.shipFullName,
        userId: orders.userId,
        couponCode: orders.couponCode,
        cancelReason: orders.cancelReason,
        items: itemCount,
      })
      .from(orders)
      .where(where)
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(sql`${SORT_EXPRESSIONS[sort]} ${direction}`, sql`${orders.id} asc`)
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
    db
      .select({ status: displayStatusSql, n: count() })
      .from(orders)
      .where(baseWhere)
      .groupBy(displayStatusSql),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const countByStatus = new Map(statusCounts.map((r) => [r.status, r.n]));
  const allCount = statusCounts
    .filter((r) => r.status !== "not_paid")
    .reduce((sum, r) => sum + r.n, 0);

  // The default sort is left out of URLs to keep them clean.
  function buildHref(
    opts: { page?: number; sort?: SortKey; dir?: SortDir; status?: string } = {},
  ): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = opts.status ?? status;
    if (s !== "all") params.set("status", s);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const sk = opts.sort ?? sort;
    const d = opts.dir ?? dir;
    if (!parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, sk, d).isDefault) {
      params.set("sort", sk);
      params.set("dir", d);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  }
  const makeHref = (nextPage: number) => buildHref({ page: nextPage });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));

  const tableRows = rows.map((o) => ({
    key: o.id,
    cells: [
      // Only the order number opens the order — the rest of the row isn't a link.
      <Link
        key="order"
        href={`/admin/orders/${o.id}`}
        className="font-medium whitespace-nowrap text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        IK-{o.orderNumber}
      </Link>,
      <div key="customer">
        <Link
          href={`/admin/customers/${o.userId}`}
          className="text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {o.shipFullName}
        </Link>
        <p className="text-xs text-muted-foreground">{o.customerEmail}</p>
      </div>,
      <span key="items" className="whitespace-nowrap tabular-nums">
        {o.items} {o.items === 1 ? "item" : "items"}
      </span>,
      <span key="date" className="whitespace-nowrap">
        {formatAdminDateTime(o.createdAt)}
      </span>,
      <OrderStatusBadge key="status" status={displayOrderStatus(o.status, o.cancelReason)} />,
      o.couponCode ? (
        <span key="coupon" className="font-mono text-xs">
          {o.couponCode}
        </span>
      ) : (
        <span key="coupon" className="text-muted-foreground">
          —
        </span>
      ),
      <span key="total" className="font-medium whitespace-nowrap tabular-nums">
        {formatINR(o.totalPaise)}
      </span>,
      <div key="actions" className="flex justify-end">
        <OrderRowActions orderId={o.id} orderNumber={o.orderNumber} status={o.status} />
      </div>,
    ],
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Orders" />

      {/* Status tabs with counts — "To process" is the daily job. */}
      <nav aria-label="Order status" className="-mb-2 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            const n = tab.value === "all" ? allCount : (countByStatus.get(tab.value) ?? 0);
            return (
              <li key={tab.value}>
                <Link
                  href={buildHref({ status: tab.value })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-md px-1.5 text-xs tabular-nums",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        action="/admin/orders"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Order #, name or email…"
            className="w-full pl-9"
          />
        </div>
        <DateRangeField defaultFrom={from} defaultTo={to} />
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {isDefaultSort ? null : (
          <>
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
          </>
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="soft" className="flex-1 sm:flex-none">
            <SearchIcon /> Search
          </Button>
          {isFiltered || !isDefaultSort ? (
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              render={<Link href="/admin/orders" />}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchIcon}
            title="No orders match these filters"
            description="Try a different search, date range or status."
          />
        ) : (
          <EmptyState
            icon={ShoppingCartIcon}
            title="No orders yet"
            description="Orders appear here as soon as customers check out."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={["Order", "Customer", "Items", "Date", "Status", "Coupon", "Total", ""]}
              headerClassNames={[
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                "text-right",
              ]}
              sortLinks={[
                sortLink("order"),
                undefined,
                undefined,
                sortLink("date"),
                undefined,
                undefined,
                sortLink("total"),
                undefined,
              ]}
              rows={tableRows}
            />
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={ADMIN_PAGE_SIZE}
            makeHref={makeHref}
          />
        </div>
      )}
    </div>
  );
}

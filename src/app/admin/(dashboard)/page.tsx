import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cacheLife } from "next/cache";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { BoxesIcon, PackageCheckIcon, TicketPercentIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { getCatalogSettings } from "@/server/modules/settings/queries";
import {
  couponRedemptions,
  coupons,
  inventory,
  orders,
  products,
  productVariants,
  user,
} from "@/server/db/schema";
import { isForSale } from "@/server/modules/inventory/selling";
import { formatINR } from "@/server/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/app/admin/_components/page-header";
import { MetricStrip } from "@/app/admin/_components/metric-strip";
import { TrendChart } from "@/app/admin/_components/trend-chart";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { formatAdminDate } from "@/app/admin/_lib/format-date";
import {
  endOfStoreDay,
  startOfStoreDay,
  storeDay,
  storeDaySql,
  storeDaysAgo,
  storeDaysBetween,
  storeMonthsAgo,
} from "@/app/admin/_lib/store-time";
import { DashboardRangeSelect } from "./dashboard-range-select";
import { RANGE_OPTIONS } from "./dashboard-ranges";

export const metadata: Metadata = { title: "Dashboard - India Kitsch Admin" };

// Shared between the metric strip and the trend chart below it, so an
// "Orders"/"Revenue" number always ties to the same color as its chart.
const ORDERS_COLOR = "oklch(0.5 0.15 250)";
const REVENUE_COLOR = "oklch(0.5 0.14 155)";
const CUSTOMERS_COLOR = "oklch(0.52 0.1 200)";
const COUPONS_COLOR = "oklch(0.58 0.13 70)";

/** Coupon uses count only when their order was actually paid (same rule as
 * Revenue), so abandoned checkouts still holding a redemption don't inflate
 * it. A cancelled/expired order's redemption is deleted by releaseCoupon. */
const paidRedemptionJoin = and(eq(orders.id, couponRedemptions.orderId), isNotNull(orders.paidAt));

/** Resolves the `?range=`/`?from=`/`?to=` searchParams into a concrete
 * [since, until] window and its label - the single source of truth the
 * page queries against, kept separate from `DashboardRangeSelect` (which
 * only ever reads/writes the URL, never computes dates itself). */
function resolveRange(
  range: string | undefined,
  from: string | undefined,
  to: string | undefined,
): { since: Date; until: Date; label: string } {
  // All boundaries are store-calendar (IST) days, whatever zone the server
  // runs in - see _lib/store-time.ts.
  const now = new Date();
  const today = storeDaysAgo(0, now);
  switch (range) {
    case "7d":
      return { since: storeDaysAgo(7, now), until: now, label: "Last 7 days" };
    case "1m":
      return { since: storeMonthsAgo(1, now), until: now, label: "Last 1 month" };
    case "3m":
      return { since: storeMonthsAgo(3, now), until: now, label: "Last 3 months" };
    case "custom":
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { since: startOfStoreDay(from), until: endOfStoreDay(to), label: "Custom range" };
      }
      return { since: today, until: now, label: "Today" };
    default:
      return { since: today, until: now, label: "Today" };
  }
}

/** docs/07 §13: "SQL aggregates cached ~60s" — a short time-based cache
 * (not tag-based: nothing in checkout/admin currently revalidates a
 * dashboard-specific tag, and re-deriving one from every order/customer/
 * coupon mutation path is real, real-infra-untested surface this doesn't
 * warrant yet). `since`/`until` are already plain `Date`s passed in from
 * outside (never read from `searchParams` in here), which `"use cache"`
 * requires and which also gives each distinct range its own cache entry.
 * Caveat, not yet verified against a real deploy: on Vercel's default
 * serverless runtime, the in-memory cache typically doesn't persist across
 * separate invocations (Next's own docs on `"use cache"`), so the practical
 * benefit here may be limited to same-instance reuse and build-time
 * prerendering rather than a guaranteed 60s wall-clock cache in production —
 * worth a real measurement once there's real traffic. */
async function windowStats(since: Date, until: Date) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const [orderCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(gte(orders.createdAt, since), lte(orders.createdAt, until)));

  const [revenueRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.totalPaise} - ${orders.refundedPaise}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        isNotNull(orders.paidAt),
        gte(orders.paidAt, since),
        lte(orders.paidAt, until),
        sql`${orders.status} in ('paid','processing','shipped','delivered','refunded')`,
      ),
    );

  const [customersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "customer"), gte(user.createdAt, since), lte(user.createdAt, until)));

  const [couponsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      discount: sql<number>`coalesce(sum(${couponRedemptions.amountPaise}), 0)::int`,
    })
    .from(couponRedemptions)
    .innerJoin(orders, paidRedemptionJoin)
    .where(and(gte(orders.paidAt, since), lte(orders.paidAt, until)));

  return {
    orderCount: orderCountRow?.count ?? 0,
    revenuePaise: revenueRow?.total ?? 0,
    newCustomers: customersRow?.count ?? 0,
    couponUses: couponsRow?.count ?? 0,
    couponDiscountPaise: couponsRow?.discount ?? 0,
  };
}

/** The most-used coupon codes in the window, by paid uses. */
async function topCoupons(since: Date, until: Date) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  return db
    .select({
      code: coupons.code,
      uses: sql<number>`count(*)::int`,
      discountPaise: sql<number>`sum(${couponRedemptions.amountPaise})::int`,
    })
    .from(couponRedemptions)
    .innerJoin(orders, paidRedemptionJoin)
    .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .where(and(gte(orders.paidAt, since), lte(orders.paidAt, until)))
    .groupBy(coupons.code)
    .orderBy(desc(sql`count(*)`), coupons.code)
    .limit(5);
}

/** Oldest-first paid orders still awaiting processing — always the same
 * shape regardless of the dashboard's date-range filter (this list is
 * "what needs doing right now", not scoped to a period). */
async function needsProcessing() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  return db.query.orders.findMany({
    where: eq(orders.status, "paid"),
    orderBy: (o, { asc }) => [asc(o.createdAt)],
    limit: 8,
  });
}

/** Lowest-stock-first sizes & colours actually for sale (shared rule,
 * inventory/selling.ts) — a paused size & colour or an archived product
 * never shows here. `threshold` is the owner's Settings → Products & stock
 * value, passed in as a plain number so it's part of this cache's key. */
async function lowStockList(threshold: number) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const available = sql<number>`(${inventory.onHand} - ${inventory.reserved})::int`;
  return db
    .select({
      variantId: inventory.variantId,
      available,
      productName: products.name,
      size: productVariants.size,
      color: productVariants.color,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(isForSale, sql`${inventory.onHand} - ${inventory.reserved} <= ${threshold}`))
    .orderBy(sql`${inventory.onHand} - ${inventory.reserved} asc`, products.name)
    .limit(8);
}

const MAX_TREND_DAYS = 180;

interface DailyPoint {
  date: string;
  orderCount: number;
  revenuePaise: number;
  newCustomers: number;
  couponUses: number;
  couponDiscountPaise: number;
}

/** One point per calendar day in [since, until], zero-filled for days with
 * no activity so the trend charts never show a gap. A custom range longer
 * than MAX_TREND_DAYS is clamped to its most recent slice - the metric
 * strip above still reflects the full range regardless. */
async function dailySeries(since: Date, until: Date): Promise<DailyPoint[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const start = startOfStoreDay(
    storeDay(new Date(Math.max(since.getTime(), until.getTime() - MAX_TREND_DAYS * 86_400_000))),
  );
  const ordersCreatedDay = storeDaySql(orders.createdAt, { withTimezone: true });
  const ordersPaidDay = storeDaySql(orders.paidAt, { withTimezone: true });
  const userCreatedDay = storeDaySql(user.createdAt, { withTimezone: false });

  const [orderRows, revenueRows, customerRows, couponRows] = await Promise.all([
    db
      .select({
        day: ordersCreatedDay,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(gte(orders.createdAt, start), lte(orders.createdAt, until)))
      .groupBy(ordersCreatedDay),
    db
      .select({
        day: ordersPaidDay,
        total: sql<number>`coalesce(sum(${orders.totalPaise} - ${orders.refundedPaise}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          isNotNull(orders.paidAt),
          gte(orders.paidAt, start),
          lte(orders.paidAt, until),
          sql`${orders.status} in ('paid','processing','shipped','delivered','refunded')`,
        ),
      )
      .groupBy(ordersPaidDay),
    db
      .select({
        day: userCreatedDay,
        count: sql<number>`count(*)::int`,
      })
      .from(user)
      .where(and(eq(user.role, "customer"), gte(user.createdAt, start), lte(user.createdAt, until)))
      .groupBy(userCreatedDay),
    db
      .select({
        day: ordersPaidDay,
        count: sql<number>`count(*)::int`,
        discount: sql<number>`sum(${couponRedemptions.amountPaise})::int`,
      })
      .from(couponRedemptions)
      .innerJoin(orders, paidRedemptionJoin)
      .where(and(gte(orders.paidAt, start), lte(orders.paidAt, until)))
      .groupBy(ordersPaidDay),
  ]);

  const orderMap = new Map(orderRows.map((r) => [r.day, r.count]));
  const revenueMap = new Map(revenueRows.map((r) => [r.day, r.total]));
  const customerMap = new Map(customerRows.map((r) => [r.day, r.count]));
  const couponMap = new Map(couponRows.map((r) => [r.day, r]));

  return storeDaysBetween(start, until).map((key) => ({
    date: key,
    orderCount: orderMap.get(key) ?? 0,
    revenuePaise: revenueMap.get(key) ?? 0,
    newCustomers: customerMap.get(key) ?? 0,
    couponUses: couponMap.get(key)?.count ?? 0,
    couponDiscountPaise: couponMap.get(key)?.discount ?? 0,
  }));
}

export default async function AdminDashboardPage(props: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  // "Today" is a genuinely request-time value (docs/07 §13: admin pages are
  // never cached) - connection() stops Cache Components from baking this
  // build's timestamp into a static shell forever.
  await connection();

  const searchParams = await props.searchParams;
  const range = RANGE_OPTIONS.some((o) => o.value === searchParams.range)
    ? searchParams.range!
    : "today";
  const { since, until, label } = resolveRange(range, searchParams.from, searchParams.to);

  // "Low stock" uses the owner's level from Settings → Products & stock.
  const catalogSettings = await getCatalogSettings();
  const [period, series, needsAction, lowStock, popularCoupons] = await Promise.all([
    windowStats(since, until),
    dailySeries(since, until),
    needsProcessing(),
    lowStockList(catalogSettings.lowStockThreshold),
    topCoupons(since, until),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Dashboard"
          description={
            <>
              Store activity - <span className="font-semibold text-foreground">{label}</span>.
            </>
          }
        />
        <DashboardRangeSelect range={range} from={searchParams.from} to={searchParams.to} />
      </div>

      <MetricStrip
        metrics={[
          { label: "Orders", value: String(period.orderCount), color: ORDERS_COLOR },
          { label: "Revenue", value: formatINR(period.revenuePaise), color: REVENUE_COLOR },
          {
            label: "New customers",
            value: String(period.newCustomers),
            color: CUSTOMERS_COLOR,
          },
          {
            label: "Coupons used",
            value: String(period.couponUses),
            detail: `${formatINR(period.couponDiscountPaise)} discount`,
            color: COUPONS_COLOR,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Orders"
          mode="bar"
          color={ORDERS_COLOR}
          points={series.map((p) => ({
            date: p.date,
            value: p.orderCount,
            label: String(p.orderCount),
          }))}
        />
        <TrendChart
          title="Revenue"
          mode="area"
          color={REVENUE_COLOR}
          points={series.map((p) => ({
            date: p.date,
            value: p.revenuePaise,
            label: formatINR(p.revenuePaise),
          }))}
        />
        <TrendChart
          title="New customers"
          mode="bar"
          color={CUSTOMERS_COLOR}
          points={series.map((p) => ({
            date: p.date,
            value: p.newCustomers,
            label: String(p.newCustomers),
          }))}
        />
        <TrendChart
          title="Coupons used"
          mode="bar"
          color={COUPONS_COLOR}
          points={series.map((p) => ({
            date: p.date,
            value: p.couponUses,
            label:
              p.couponUses > 0 ? `${p.couponUses} · ${formatINR(p.couponDiscountPaise)} off` : "0",
          }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheckIcon className="size-4 text-primary" /> Needs processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {needsAction.length === 0 ? (
              <EmptyState
                icon={PackageCheckIcon}
                title="Nothing waiting"
                description="All paid orders have been moved along."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {needsAction.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-primary"
                  >
                    <span className="font-medium">IK-{order.orderNumber}</span>
                    <span className="text-muted-foreground">
                      {formatAdminDate(order.createdAt)}
                    </span>
                    <span className="font-medium">{formatINR(order.totalPaise)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BoxesIcon className="size-4 text-primary" /> Low stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState icon={BoxesIcon} title="Stock levels look healthy" />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {lowStock.map((row) => (
                  <Link
                    key={row.variantId}
                    href={`/admin/inventory/${row.variantId}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-primary"
                  >
                    <span className="font-medium">
                      {row.productName}
                      <span className="ml-1 font-normal text-muted-foreground">
                        {row.size} / {row.color}
                      </span>
                    </span>
                    <span className="font-medium text-destructive">
                      {row.available <= 0 ? "Sold out" : `${row.available} left`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketPercentIcon className="size-4 text-primary" /> Top coupons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {popularCoupons.length === 0 ? (
              <EmptyState
                icon={TicketPercentIcon}
                title="No coupons used"
                description="No paid orders used a coupon in this period."
              />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {popularCoupons.map((c) => (
                  <Link
                    key={c.code}
                    href={`/admin/coupons?q=${encodeURIComponent(c.code)}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                  >
                    <span className="font-mono font-medium">{c.code}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.uses} {c.uses === 1 ? "use" : "uses"}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatINR(c.discountPaise)} off
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

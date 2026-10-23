import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { coupons } from "@/server/db/schema";

/**
 * A coupon's effective state at checkout, derived from its switch, dates and
 * usage. `isActive` alone doesn't answer "does this code work right now?" -
 * an active coupon can still be expired, not started yet, or used up.
 * Precedence and comparisons mirror validate.ts's eligibility checks.
 */
export const COUPON_STATUSES = ["live", "scheduled", "expired", "used_up", "inactive"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export function isCouponStatus(value: string): value is CouponStatus {
  return (COUPON_STATUSES as readonly string[]).includes(value);
}

/**
 * The status as one SQL CASE expression, so the table's badge and its
 * status filter are computed by the same rule and can't disagree.
 */
export function couponStatusSql(now: Date): SQL<CouponStatus> {
  // A raw Date interpolated into a `sql` template isn't serialized by the
  // postgres-js driver (it throws ERR_INVALID_ARG_TYPE) - only typed column
  // comparisons like `lt(col, date)` get that mapping - so bind an ISO string.
  const nowParam = sql`${now.toISOString()}::timestamptz`;
  return sql<CouponStatus>`case
    when not ${coupons.isActive} then 'inactive'
    when ${coupons.endsAt} is not null and ${coupons.endsAt} < ${nowParam} then 'expired'
    when ${coupons.maxUses} is not null and ${coupons.usedCount} >= ${coupons.maxUses} then 'used_up'
    when ${coupons.startsAt} is not null and ${coupons.startsAt} > ${nowParam} then 'scheduled'
    else 'live'
  end`;
}

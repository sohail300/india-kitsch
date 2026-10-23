/**
 * Demo activity for the dashboard's "New customers" and "Coupons used"
 * figures/charts. Never run against production.
 *
 * 1. Signups: adds 40 seed customers (no orders) with `created_at` spread
 *    over the last ~90 days, and moves the order seed's 5 customers to
 *    signup dates before their first order - so the signup chart isn't a
 *    single spike on the day the seeds ran.
 * 2. Coupon use: applies a coupon to roughly a third of the order seed's
 *    paid orders that don't have one yet - a real `coupon_redemptions` row
 *    plus the order's `coupon_code` / `discount_paise` / `total_paise`
 *    updated to match, and the coupon's `used_count` bumped.
 *
 * Requires seed-orders.ts and seed-coupons.ts to have run. Idempotent:
 * signups are keyed by email, and orders that already have a coupon are
 * skipped, so a re-run only tops up what's missing.
 *
 * Inserts directly rather than via `redeemCoupon` / `computeCouponDiscount`
 * - those import `server-only` modules, which throw under plain tsx (see
 * seed-orders.ts's header). The discount math below mirrors
 * coupons/discount.ts.
 *
 * Run with: npx tsx src/server/db/seed-dashboard-activity.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNotNull, isNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createId } from "@/server/lib/ids";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const DAY_MS = 86_400_000;
const EXTRA_SIGNUPS = 40;
const SIGNUP_LOOKBACK_DAYS = 90;
const COUPON_SHARE = 0.35;

const FIRST_NAMES = [
  "Aarav",
  "Isha",
  "Rohan",
  "Meera",
  "Kabir",
  "Tara",
  "Vivaan",
  "Anika",
  "Arjun",
  "Diya",
];
const LAST_NAMES = ["Sharma", "Kapoor", "Das", "Pillai", "Joshi", "Bose", "Gill", "Khan"];

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/** Mirrors coupons/discount.ts's computeCouponDiscount. */
function discountFor(coupon: typeof schema.coupons.$inferSelect, subtotalPaise: number): number {
  let raw =
    coupon.type === "percent"
      ? Math.round((subtotalPaise * (coupon.valueBps ?? 0)) / 10_000)
      : (coupon.valuePaise ?? 0);
  if (coupon.maxDiscountPaise !== null) raw = Math.min(raw, coupon.maxDiscountPaise);
  return Math.min(raw, subtotalPaise);
}

async function seedSignups(): Promise<number> {
  const now = Date.now();
  const rows = Array.from({ length: EXTRA_SIGNUPS }, (_, i) => {
    const createdAt = new Date(
      now - randomInt(SIGNUP_LOOKBACK_DAYS) * DAY_MS - randomInt(20) * 3_600_000,
    );
    return {
      id: createId(),
      name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
      email: `seed-signup-${i + 1}@indiakitsch.test`,
      emailVerified: i % 3 !== 0,
      createdAt,
      updatedAt: createdAt,
    };
  });
  const inserted = await db
    .insert(schema.user)
    .values(rows)
    .onConflictDoNothing({ target: schema.user.email })
    .returning({ id: schema.user.id });

  // The order seed's customers: sign up 1–14 days before their first order.
  await db.execute(sql`
    update app."user" u
    set created_at = first_order.at - (1 + floor(random() * 14)) * interval '1 day'
    from (
      select user_id, min(created_at) at from app.orders group by user_id
    ) first_order
    where first_order.user_id = u.id
      and u.email like 'seed-customer-%@indiakitsch.test'
      and u.created_at > first_order.at
  `);

  return inserted.length;
}

async function seedCouponUse(): Promise<number> {
  // Coupons that could still take a use: active and under their limit.
  const usable = await db.query.coupons.findMany({
    where: and(
      eq(schema.coupons.isActive, true),
      sql`(${schema.coupons.maxUses} is null or ${schema.coupons.usedCount} < ${schema.coupons.maxUses})`,
    ),
  });
  if (usable.length === 0) {
    console.warn("No usable coupons - run seed-coupons.ts first.");
    return 0;
  }

  const candidates = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        like(schema.orders.razorpayOrderId, "seed_ord_%"),
        isNotNull(schema.orders.paidAt),
        isNull(schema.orders.couponCode),
      ),
    );

  let applied = 0;
  for (const order of candidates) {
    if (Math.random() >= COUPON_SHARE) continue;
    const eligible = usable.filter(
      (c) =>
        c.minSubtotalPaise <= order.subtotalPaise &&
        (c.maxUses === null || c.usedCount < c.maxUses),
    );
    if (eligible.length === 0) continue;
    const coupon = eligible[randomInt(eligible.length)]!;
    const discountPaise = discountFor(coupon, order.subtotalPaise);
    if (discountPaise <= 0) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(schema.orders)
        .set({
          couponCode: coupon.code,
          discountPaise,
          totalPaise: order.subtotalPaise - discountPaise + order.shippingPaise,
        })
        .where(eq(schema.orders.id, order.id));
      await tx.insert(schema.couponRedemptions).values({
        couponId: coupon.id,
        userId: order.userId,
        orderId: order.id,
        amountPaise: discountPaise,
        createdAt: order.createdAt,
      });
      await tx
        .update(schema.coupons)
        .set({ usedCount: sql`${schema.coupons.usedCount} + 1` })
        .where(eq(schema.coupons.id, coupon.id));
    });
    coupon.usedCount += 1;
    applied += 1;
  }
  return applied;
}

async function main() {
  const signups = await seedSignups();
  const redemptions = await seedCouponUse();
  console.log(`Added ${signups} seed signups and applied coupons to ${redemptions} paid orders.`);
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await client.end();
    process.exit(1);
  });

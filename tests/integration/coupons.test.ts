/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Covers coupons/validate.ts's DB-dependent
 * eligibility checks and, as this phase's concurrency centerpiece,
 * coupons/service.ts's atomic conditional-UPDATE redemption racing for a
 * coupon's last few uses — the exact pattern docs/09 §20 calls out:
 * "Coupon-limit races; transaction rollback on partial failure."
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { CouponExhaustedError } from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import { redeemCoupon } from "@/server/modules/coupons/service";
import { couponStatusSql } from "@/server/modules/coupons/status";
import { validateCoupon } from "@/server/modules/coupons/validate";
import { migrateTestDb } from "../setup/migrate-test-db";

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — see .env.example (run `podman compose up -d` / `docker compose up -d` first).",
    );
  }
  return url;
}

const client = postgres(requireTestDatabaseUrl(), { max: 10 });
const db = drizzle(client, { schema });

const createdCouponIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  if (createdCouponIds.length > 0) {
    await db
      .delete(schema.couponRedemptions)
      .where(inArray(schema.couponRedemptions.couponId, createdCouponIds));
    await db.delete(schema.coupons).where(inArray(schema.coupons.id, createdCouponIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  await client.end();
});

async function createTestUser(): Promise<string> {
  const id = createId();
  createdUserIds.push(id);
  await db.insert(schema.user).values({
    id,
    name: "Test User",
    email: `test-${id}@indiakitsch.test`,
    emailVerified: true,
  });
  return id;
}

async function createCoupon(overrides: Partial<typeof schema.coupons.$inferInsert> = {}) {
  const id = createId();
  createdCouponIds.push(id);
  const code = `TEST${id}`.slice(0, 40).toUpperCase();
  await db.insert(schema.coupons).values({
    id,
    code,
    type: "percent",
    valueBps: 1000,
    minSubtotalPaise: 0,
    isActive: true,
    ...overrides,
  });
  return { id, code };
}

describe("validateCoupon", () => {
  it("returns NOT_FOUND for an unknown code", async () => {
    const result = await validateCoupon("NO-SUCH-CODE", { subtotalPaise: 100000 }, db);
    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: expect.any(String) });
  });

  it("returns INACTIVE for a deactivated coupon", async () => {
    const { code } = await createCoupon({ isActive: false });
    const result = await validateCoupon(code, { subtotalPaise: 100000 }, db);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("INACTIVE");
  });

  it("returns NOT_STARTED before startsAt and EXPIRED after endsAt", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    const { code: futureCode } = await createCoupon({ startsAt: future });
    const notStarted = await validateCoupon(futureCode, { subtotalPaise: 100000 }, db);
    expect(notStarted.ok === false && notStarted.code).toBe("NOT_STARTED");

    const { code: expiredCode } = await createCoupon({ endsAt: past });
    const expired = await validateCoupon(expiredCode, { subtotalPaise: 100000 }, db);
    expect(expired.ok === false && expired.code).toBe("EXPIRED");
  });

  it("returns MIN_SUBTOTAL_NOT_MET below the coupon's minimum", async () => {
    const { code } = await createCoupon({ minSubtotalPaise: 500000 });
    const result = await validateCoupon(code, { subtotalPaise: 100000 }, db);
    expect(result.ok === false && result.code).toBe("MIN_SUBTOTAL_NOT_MET");
  });

  it("returns USES_EXHAUSTED once usedCount reaches maxUses", async () => {
    const { code } = await createCoupon({ maxUses: 1, usedCount: 1 });
    const result = await validateCoupon(code, { subtotalPaise: 100000 }, db);
    expect(result.ok === false && result.code).toBe("USES_EXHAUSTED");
  });

  it("returns SIGN_IN_REQUIRED for a per-user-limited coupon with no userId", async () => {
    const { code } = await createCoupon({ perUserLimit: 1 });
    const result = await validateCoupon(code, { subtotalPaise: 100000 }, db);
    expect(result.ok === false && result.code).toBe("SIGN_IN_REQUIRED");
  });

  it("returns PER_USER_LIMIT_REACHED once the user has redeemed up to their limit", async () => {
    const { id: couponId, code } = await createCoupon({ perUserLimit: 1 });
    const userId = await createTestUser();
    await db.insert(schema.couponRedemptions).values({
      couponId,
      userId,
      orderId: createId(),
      amountPaise: 1000,
    });

    const result = await validateCoupon(code, { userId, subtotalPaise: 100000 }, db);
    expect(result.ok === false && result.code).toBe("PER_USER_LIMIT_REACHED");
  });

  it("succeeds and computes the discount for an eligible coupon", async () => {
    const { code } = await createCoupon({ type: "percent", valueBps: 1000 }); // 10%
    const result = await validateCoupon(code, { subtotalPaise: 100000 }, db);
    expect(result).toMatchObject({ ok: true, code, discountPaise: 10000 });
  });
});

describe("redeemCoupon concurrency", () => {
  it("exactly maxUses redemptions succeed when more checkouts race for a limited coupon", async () => {
    const maxUses = 3;
    const attempts = 10;
    const { id: couponId, code } = await createCoupon({ maxUses, usedCount: 0 });
    const userId = await createTestUser();

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        db.transaction((tx) =>
          redeemCoupon(tx, { couponId, code, userId, orderId: createId(), amountPaise: 1000 }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(maxUses);
    expect(failed).toHaveLength(attempts - maxUses);
    for (const failure of failed) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(CouponExhaustedError);
    }

    const [row] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, couponId));
    expect(row?.usedCount).toBe(maxUses);

    const redemptions = await db
      .select()
      .from(schema.couponRedemptions)
      .where(eq(schema.couponRedemptions.couponId, couponId));
    expect(redemptions).toHaveLength(maxUses);
  }, 20_000);

  it("an unlimited coupon (maxUses null) never rejects", async () => {
    const { id: couponId, code } = await createCoupon({ maxUses: null });
    const userId = await createTestUser();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.transaction((tx) =>
          redeemCoupon(tx, { couponId, code, userId, orderId: createId(), amountPaise: 1000 }),
        ),
      ),
    );

    expect(results).toHaveLength(5);
    const [row] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, couponId));
    expect(row?.usedCount).toBe(5);
  }, 20_000);
});

describe("couponStatusSql", () => {
  it("derives each status, with the switch and expiry taking precedence", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    const cases = {
      live: await createCoupon(),
      liveInWindow: await createCoupon({ startsAt: past, endsAt: future }),
      scheduled: await createCoupon({ startsAt: future }),
      expired: await createCoupon({ endsAt: past }),
      usedUp: await createCoupon({ maxUses: 2, usedCount: 2 }),
      inactive: await createCoupon({ isActive: false }),
      // Switched off beats every other state; expired beats used up.
      inactiveAndExpired: await createCoupon({ isActive: false, endsAt: past }),
      expiredAndUsedUp: await createCoupon({ endsAt: past, maxUses: 1, usedCount: 1 }),
    };

    const rows = await db
      .select({ id: schema.coupons.id, status: couponStatusSql(new Date()) })
      .from(schema.coupons)
      .where(
        inArray(
          schema.coupons.id,
          Object.values(cases).map((c) => c.id),
        ),
      );
    const statusOf = (key: keyof typeof cases) => rows.find((r) => r.id === cases[key].id)?.status;

    expect(statusOf("live")).toBe("live");
    expect(statusOf("liveInWindow")).toBe("live");
    expect(statusOf("scheduled")).toBe("scheduled");
    expect(statusOf("expired")).toBe("expired");
    expect(statusOf("usedUp")).toBe("used_up");
    expect(statusOf("inactive")).toBe("inactive");
    expect(statusOf("inactiveAndExpired")).toBe("inactive");
    expect(statusOf("expiredAndUsedUp")).toBe("expired");
  });
});

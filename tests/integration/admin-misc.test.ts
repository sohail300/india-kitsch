/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Covers the smaller Phase 7 admin domains:
 * inventory adjustments, coupon CRUD, customer management, settings.
 */
import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import { adjustStock } from "@/server/modules/inventory/admin";
import { createCoupon, setCouponActive, updateCoupon } from "@/server/modules/coupons/admin";
import { getCustomerDetail, listCustomers } from "@/server/modules/customers/queries";
import { setCustomerDisabled } from "@/server/modules/customers/service";
import {
  updateCatalogSettings,
  updateShippingSettings,
  updateStoreInfo,
} from "@/server/modules/settings/admin";
import {
  getCatalogSettings,
  getSettingsLastUpdated,
  getShippingSettings,
  getStoreInfo,
} from "@/server/modules/settings/queries";
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

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdCouponIds: string[] = [];

async function createAdminUser(): Promise<string> {
  const id = createId();
  createdUserIds.push(id);
  await db.insert(schema.user).values({
    id,
    name: "Admin",
    email: `admin-${id}@indiakitsch.test`,
    role: "admin",
    emailVerified: true,
  });
  return id;
}

let adminUserId: string;

beforeAll(async () => {
  await migrateTestDb();
  adminUserId = await createAdminUser();
}, 60_000);

afterAll(async () => {
  if (createdCouponIds.length > 0) {
    await db.delete(schema.coupons).where(inArray(schema.coupons.id, createdCouponIds));
  }
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  await db
    .delete(schema.storeSettings)
    .where(inArray(schema.storeSettings.key, ["shipping", "storeInfo", "catalog"]));
  if (createdOrderIds.length > 0) {
    await db.delete(schema.orders).where(inArray(schema.orders.id, createdOrderIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.adminUserId, createdUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  await client.end();
});

async function createTestVariant(onHand: number): Promise<string> {
  const categoryId = createId();
  createdCategoryIds.push(categoryId);
  await db
    .insert(schema.categories)
    .values({ id: categoryId, name: "Test", slug: `admin-misc-cat-${categoryId}` });
  const productId = createId();
  await db.insert(schema.products).values({
    id: productId,
    slug: `admin-misc-product-${productId}`,
    name: "Test Product",
    categoryId,
    pricePaise: 100000,
    gstRateBps: 1200,
    status: "active",
  });
  const variantId = createId();
  await db
    .insert(schema.productVariants)
    .values({ id: variantId, productId, sku: `SKU-${variantId}`, size: "M", color: "Red" });
  await db.insert(schema.inventory).values({ variantId, onHand, reserved: 0 });
  return variantId;
}

describe("adjustStock", () => {
  it("increases on_hand for a restock and records the movement", async () => {
    const variantId = await createTestVariant(5);
    const { result } = await adjustStock(
      { variantId, delta: 10, reason: "restock", note: "delivery #42" },
      adminUserId,
      db,
    );
    expect(result.onHand).toBe(15);

    const movement = await db.query.stockMovements.findFirst({
      where: eq(schema.stockMovements.variantId, variantId),
    });
    expect(movement).toMatchObject({ delta: 10, reason: "restock", adminUserId });
  });

  it("decreases on_hand for a loss adjustment", async () => {
    const variantId = await createTestVariant(5);
    const { result } = await adjustStock(
      { variantId, delta: -2, reason: "adjustment", note: "damaged in warehouse" },
      adminUserId,
      db,
    );
    expect(result.onHand).toBe(3);
  });

  it("rejects a decrease that would drop on_hand below reserved", async () => {
    const variantId = await createTestVariant(5);
    await db
      .update(schema.inventory)
      .set({ reserved: 5 })
      .where(eq(schema.inventory.variantId, variantId));
    await expect(
      adjustStock({ variantId, delta: -1, reason: "adjustment", note: "test" }, adminUserId, db),
    ).rejects.toThrow(/below reserved/);
  });

  it("rejects a zero delta", async () => {
    const variantId = await createTestVariant(5);
    await expect(
      adjustStock({ variantId, delta: 0, reason: "adjustment", note: "test" }, adminUserId, db),
    ).rejects.toThrow();
  });

  it("only accepts manual reasons, and restock/return only as increases", async () => {
    const variantId = await createTestVariant(5);
    // A system-only ledger reason can't be recorded by hand.
    await expect(
      adjustStock({ variantId, delta: 1, reason: "sale" as never, note: "x" }, adminUserId, db),
    ).rejects.toThrow(/unsupported reason/);
    await expect(
      adjustStock({ variantId, delta: -1, reason: "restock", note: "x" }, adminUserId, db),
    ).rejects.toThrow(/only increase/);

    // A customer return logged by hand is an increase with the `return` reason.
    const { result } = await adjustStock(
      { variantId, delta: 1, reason: "return", note: "Returned by a customer" },
      adminUserId,
      db,
    );
    expect(result.onHand).toBe(6);
  });

  it("accepts an adjustment without a note, still logging its reason", async () => {
    const variantId = await createTestVariant(5);
    const { result } = await adjustStock(
      { variantId, delta: 2, reason: "restock", note: "  " },
      adminUserId,
      db,
    );
    expect(result.onHand).toBe(7);
    const [movement] = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.variantId, variantId))
      .orderBy(desc(schema.stockMovements.createdAt))
      .limit(1);
    expect(movement).toMatchObject({ delta: 2, reason: "restock", note: null });
  });
});

describe("coupons/admin", () => {
  it("creates a percent coupon with only valueBps set", async () => {
    const id = createId();
    const code = `ADMIN${id}`.slice(0, 40).toUpperCase();
    const { result } = await createCoupon(
      { type: "percent", code, valueBps: 1500 },
      adminUserId,
      db,
    );
    createdCouponIds.push(result.id);
    expect(result).toMatchObject({
      code,
      type: "percent",
      valueBps: 1500,
      valuePaise: null,
      isActive: true,
      createdByAdminId: adminUserId,
    });
  });

  it("creates a fixed coupon with only valuePaise set", async () => {
    const id = createId();
    const code = `ADMIN${id}`.slice(0, 40).toUpperCase();
    const { result } = await createCoupon(
      { type: "fixed", code, valuePaise: 5000 },
      adminUserId,
      db,
    );
    createdCouponIds.push(result.id);
    expect(result).toMatchObject({ type: "fixed", valuePaise: 5000, valueBps: null });
  });

  it("rejects startsAt on or after endsAt", async () => {
    const id = createId();
    const code = `ADMIN${id}`.slice(0, 40).toUpperCase();
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000);
    await expect(
      createCoupon(
        { type: "percent", code, valueBps: 1000, startsAt: now, endsAt: earlier },
        adminUserId,
        db,
      ),
    ).rejects.toThrow();
  });

  it("updates limits and toggles active state", async () => {
    const id = createId();
    const code = `ADMIN${id}`.slice(0, 40).toUpperCase();
    const { result: created } = await createCoupon(
      { type: "percent", code, valueBps: 1000 },
      adminUserId,
      db,
    );
    createdCouponIds.push(created.id);

    const { result: updated } = await updateCoupon(
      created.id,
      { maxUses: 100, perUserLimit: 1 },
      adminUserId,
      db,
    );
    expect(updated).toMatchObject({ maxUses: 100, perUserLimit: 1 });

    const { result: deactivated } = await setCouponActive(created.id, false, adminUserId, db);
    expect(deactivated.isActive).toBe(false);
  });

  it("rejects updating a nonexistent coupon", async () => {
    await expect(
      updateCoupon("no-such-coupon", { isActive: false }, adminUserId, db),
    ).rejects.toThrow();
  });
});

describe("customers", () => {
  async function createTestCustomer(overrides: { name?: string; disabled?: boolean } = {}) {
    const id = createId();
    createdUserIds.push(id);
    await db.insert(schema.user).values({
      id,
      name: overrides.name ?? "Jane Customer",
      email: `customer-${id}@indiakitsch.test`,
      role: "customer",
      disabled: overrides.disabled ?? false,
    });
    return id;
  }

  async function createTestOrder(
    userId: string,
    opts: { totalPaise: number; paid: boolean; refundedPaise?: number; createdAt: Date },
  ) {
    const id = createId();
    createdOrderIds.push(id);
    await db.insert(schema.orders).values({
      id,
      userId,
      status: opts.paid ? "paid" : "pending_payment",
      subtotalPaise: opts.totalPaise,
      totalPaise: opts.totalPaise,
      refundedPaise: opts.refundedPaise ?? 0,
      paidAt: opts.paid ? opts.createdAt : null,
      createdAt: opts.createdAt,
      shipFullName: "Jane",
      shipPhone: "9999999999",
      shipLine1: "1 Test St",
      shipCity: "Mumbai",
      shipState: "MH",
      shipPincode: "400001",
      customerEmail: `order-${id}@indiakitsch.test`,
      customerPhone: "9999999999",
    });
  }

  it("aggregates paid-order stats, filters by status and sorts in SQL", async () => {
    // A unique name fragment scopes the search to just this test's customers.
    const tag = `Stats${createId()}`;
    const big = await createTestCustomer({ name: `${tag} Big` });
    const small = await createTestCustomer({ name: `${tag} Small` });
    const none = await createTestCustomer({ name: `${tag} None`, disabled: true });

    const older = new Date("2026-01-10T10:00:00Z");
    const newer = new Date("2026-03-05T10:00:00Z");
    await createTestOrder(big, { totalPaise: 100_000, paid: true, createdAt: older });
    await createTestOrder(big, {
      totalPaise: 50_000,
      paid: true,
      refundedPaise: 20_000,
      createdAt: newer,
    });
    // Unpaid checkouts are ignored entirely — count, spend and last order.
    await createTestOrder(big, { totalPaise: 999_999, paid: false, createdAt: new Date() });
    await createTestOrder(small, { totalPaise: 30_000, paid: true, createdAt: older });
    await createTestOrder(none, { totalPaise: 40_000, paid: false, createdAt: newer });

    const bySpend = await listCustomers({ q: tag, sort: "spent", dir: "desc" }, db);
    expect(bySpend.items.map((i) => i.customer.id)).toEqual([big, small, none]);
    expect(bySpend.items[0]).toMatchObject({
      orderCount: 2,
      totalSpentPaise: 130_000,
      lastOrderAt: newer,
    });
    expect(bySpend.items[2]).toMatchObject({
      orderCount: 0,
      totalSpentPaise: 0,
      lastOrderAt: null,
    });

    // No last order sorts last in both directions.
    const lastAsc = await listCustomers({ q: tag, sort: "last_order", dir: "asc" }, db);
    expect(lastAsc.items.map((i) => i.customer.id)).toEqual([small, big, none]);
    const lastDesc = await listCustomers({ q: tag, sort: "last_order", dir: "desc" }, db);
    expect(lastDesc.items.map((i) => i.customer.id)).toEqual([big, small, none]);

    const disabled = await listCustomers({ q: tag, status: "disabled" }, db);
    expect(disabled.items.map((i) => i.customer.id)).toEqual([none]);
    expect(disabled.total).toBe(1);
    const active = await listCustomers({ q: tag, status: "active", sort: "name", dir: "asc" }, db);
    expect(active.items.map((i) => i.customer.id)).toEqual([big, small]);
  });

  it("lists customers and finds by search", async () => {
    const customerId = await createTestCustomer();
    const [customer] = await db.select().from(schema.user).where(eq(schema.user.id, customerId));

    const result = await listCustomers({ q: customer!.email, page: 1 }, db);
    expect(result.items.map((c) => c.customer.id)).toContain(customerId);
  });

  it("excludes admins from the customer list", async () => {
    const result = await listCustomers({ q: "@indiakitsch.test", page: 1 }, db);
    expect(result.items.every((c) => c.customer.role === "customer")).toBe(true);
  });

  it("returns addresses and orders in the customer detail view", async () => {
    const customerId = await createTestCustomer();
    await db.insert(schema.addresses).values({
      id: createId(),
      userId: customerId,
      fullName: "Jane",
      phone: "9999999999",
      line1: "1 Test St",
      city: "Mumbai",
      state: "MH",
      pincode: "400001",
    });

    const detail = await getCustomerDetail(customerId, db);
    expect(detail?.addresses).toHaveLength(1);
    expect(detail?.orders).toEqual([]);
  });

  it("disables and re-enables a customer, auditing both", async () => {
    const customerId = await createTestCustomer();
    // Disabling signs the customer out everywhere.
    await db.insert(schema.session).values({
      id: createId(),
      token: createId(),
      userId: customerId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const { result: disabled } = await setCustomerDisabled(customerId, true, adminUserId, db);
    expect(disabled.disabled).toBe(true);
    const sessionsLeft = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, customerId));
    expect(sessionsLeft).toEqual([]);

    // The detail view reads "disabled by … on …" back from the audit row.
    const [admin] = await db.select().from(schema.user).where(eq(schema.user.id, adminUserId));
    const whileDisabled = await getCustomerDetail(customerId, db);
    expect(whileDisabled?.disabledBy).toEqual({ adminEmail: admin!.email, at: expect.any(Date) });

    const { result: enabled } = await setCustomerDisabled(customerId, false, adminUserId, db);
    expect(enabled.disabled).toBe(false);
    expect((await getCustomerDetail(customerId, db))?.disabledBy).toBeNull();

    const audits = await db.query.auditLog.findMany({
      where: eq(schema.auditLog.entityId, customerId),
    });
    expect(audits.map((a) => a.action).sort()).toEqual(["customer.disable", "customer.enable"]);
  });
});

describe("settings/admin", () => {
  it("rejects badly formatted store details, and normalizes valid ones", async () => {
    const base = { sellerState: "Maharashtra", contactEmail: "owner@indiakitsch.test" };
    for (const bad of [
      { gstin: "27ABCDE1234F1Z" }, // 14 characters
      { contactPhone: "12345" },
      { addressPincode: "40001" },
      { instagramUrl: "https://example.com/indiakitsch" },
      { facebookUrl: "http://facebook.com/indiakitsch" }, // not https
    ]) {
      await expect(updateStoreInfo({ ...base, ...bad }, adminUserId, db)).rejects.toThrow();
    }

    await updateStoreInfo(
      {
        ...base,
        gstin: "27abcde1234f1z5",
        contactPhone: "+91 98765-43210",
        addressPincode: "400001",
        instagramUrl: "https://www.instagram.com/indiakitsch",
      },
      adminUserId,
      db,
    );
    expect(await getStoreInfo(db)).toMatchObject({
      gstin: "27ABCDE1234F1Z5",
      contactPhone: "+919876543210",
      addressPincode: "400001",
    });
  });

  it("still reads store info saved before the stricter rules existed", async () => {
    // A legacy value the new write rules would reject must not fall back to the placeholder.
    await db
      .insert(schema.storeSettings)
      .values({
        key: "storeInfo",
        value: { sellerState: "Goa", contactEmail: "old@indiakitsch.test", addressPincode: "12" },
      })
      .onConflictDoUpdate({
        target: schema.storeSettings.key,
        set: {
          value: { sellerState: "Goa", contactEmail: "old@indiakitsch.test", addressPincode: "12" },
        },
      });
    expect(await getStoreInfo(db)).toMatchObject({ sellerState: "Goa", addressPincode: "12" });
  });

  it("saves products & stock settings, and reports who last saved each setting", async () => {
    await db.delete(schema.storeSettings).where(eq(schema.storeSettings.key, "catalog"));
    expect(await getCatalogSettings(db)).toEqual({ defaultGstRateBps: 1800, lowStockThreshold: 5 });

    await updateCatalogSettings({ defaultGstRateBps: 500, lowStockThreshold: 3 }, adminUserId, db);
    expect(await getCatalogSettings(db)).toEqual({ defaultGstRateBps: 500, lowStockThreshold: 3 });
    await expect(
      updateCatalogSettings({ defaultGstRateBps: 5000, lowStockThreshold: 3 }, adminUserId, db),
    ).rejects.toThrow();

    const [admin] = await db.select().from(schema.user).where(eq(schema.user.id, adminUserId));
    const lastUpdated = await getSettingsLastUpdated(["catalog", "never-saved-key"], db);
    expect(lastUpdated.catalog).toEqual({ adminEmail: admin!.email, at: expect.any(Date) });
    expect(lastUpdated["never-saved-key"]).toBeUndefined();
  });

  it("writes and reads back real shipping settings, overriding the placeholder", async () => {
    await updateShippingSettings({ feePaise: 4900, freeThresholdPaise: 199900 }, adminUserId, db);
    const result = await getShippingSettings(db);
    expect(result).toEqual({ feePaise: 4900, freeThresholdPaise: 199900 });
  });

  it("writes and reads back store info, gstin left blank", async () => {
    await updateStoreInfo(
      { sellerState: "Karnataka", contactEmail: "owner@indiakitsch.test" },
      adminUserId,
      db,
    );
    const result = await getStoreInfo(db);
    expect(result).toEqual({ sellerState: "Karnataka", contactEmail: "owner@indiakitsch.test" });
  });

  it("rejects an invalid contact email", async () => {
    await expect(
      updateStoreInfo({ sellerState: "Karnataka", contactEmail: "not-an-email" }, adminUserId, db),
    ).rejects.toThrow();
  });
});

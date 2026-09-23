/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Covers the smaller Phase 7 admin domains:
 * inventory adjustments, coupon CRUD, customer management, settings.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import { adjustStock } from "@/server/modules/inventory/admin";
import { createCoupon, setCouponActive, updateCoupon } from "@/server/modules/coupons/admin";
import { getCustomerDetail, listCustomers } from "@/server/modules/customers/queries";
import { setCustomerDisabled } from "@/server/modules/customers/service";
import { updateShippingSettings, updateStoreInfo } from "@/server/modules/settings/admin";
import { getShippingSettings, getStoreInfo } from "@/server/modules/settings/queries";
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
    .where(inArray(schema.storeSettings.key, ["shipping", "storeInfo"]));
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

  it("rejects an empty note", async () => {
    const variantId = await createTestVariant(5);
    await expect(
      adjustStock({ variantId, delta: 1, reason: "adjustment", note: "" }, adminUserId, db),
    ).rejects.toThrow();
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
  async function createTestCustomer(): Promise<string> {
    const id = createId();
    createdUserIds.push(id);
    await db.insert(schema.user).values({
      id,
      name: "Jane Customer",
      email: `customer-${id}@indiakitsch.test`,
      role: "customer",
    });
    return id;
  }

  it("lists customers and finds by search", async () => {
    const customerId = await createTestCustomer();
    const [customer] = await db.select().from(schema.user).where(eq(schema.user.id, customerId));

    const result = await listCustomers({ q: customer!.email, page: 1 }, db);
    expect(result.items.map((c) => c.id)).toContain(customerId);
  });

  it("excludes admins from the customer list", async () => {
    const result = await listCustomers({ q: "@indiakitsch.test", page: 1 }, db);
    expect(result.items.every((c) => c.role === "customer")).toBe(true);
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
    const { result: disabled } = await setCustomerDisabled(customerId, true, adminUserId, db);
    expect(disabled.disabled).toBe(true);

    const { result: enabled } = await setCustomerDisabled(customerId, false, adminUserId, db);
    expect(enabled.disabled).toBe(false);

    const audits = await db.query.auditLog.findMany({
      where: eq(schema.auditLog.entityId, customerId),
    });
    expect(audits.map((a) => a.action).sort()).toEqual(["customer.disable", "customer.enable"]);
  });
});

describe("settings/admin", () => {
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

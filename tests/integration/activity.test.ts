/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20). Writes audit rows through the real admin
 * mutations, then reads them back the way the Activity log page does.
 */
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import {
  createCategory,
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/server/modules/catalog/admin";
import { listActivity, resolveActivityItems } from "@/server/modules/admin/activity";
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

const client = postgres(requireTestDatabaseUrl(), { max: 5 });
const db = drizzle(client, { schema });

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
let adminUserId: string;

beforeAll(async () => {
  await migrateTestDb();
  adminUserId = createId();
  createdUserIds.push(adminUserId);
  await db.insert(schema.user).values({
    id: adminUserId,
    name: "Admin",
    email: `activity-${adminUserId}@indiakitsch.test`,
    role: "admin",
    emailVerified: true,
  });
}, 60_000);

afterAll(async () => {
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  await db.delete(schema.auditLog).where(inArray(schema.auditLog.adminUserId, createdUserIds));
  await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  await client.end();
});

describe("Activity log queries", () => {
  it("lists an admin's changes newest first, with area counts and item names", async () => {
    const suffix = adminUserId.toLowerCase();
    const { result: category } = await createCategory(
      { name: "Activity Mugs", slug: `activity-cat-${suffix}` },
      adminUserId,
      db,
    );
    createdCategoryIds.push(category.id);
    const { result: kept } = await createProduct(
      {
        slug: `activity-kept-${suffix}`,
        name: "Kept Mug",
        categoryId: category.id,
        pricePaise: 49900,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );
    await updateProduct(kept.id, { pricePaise: 54900 }, adminUserId, db);
    const { result: gone } = await createProduct(
      {
        slug: `activity-gone-${suffix}`,
        name: "Gone Mug",
        categoryId: category.id,
        pricePaise: 10000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );
    await deleteProduct(gone.id, adminUserId, db);

    const { entries, total, areaCounts } = await listActivity(
      { area: "all", adminUserId, dir: "desc", page: 1 },
      db,
    );
    expect(total).toBe(5);
    expect(areaCounts.all).toBe(5);
    expect(areaCounts.products).toBe(4);
    expect(areaCounts.categories).toBe(1);
    expect(entries.map((e) => e.action)).toEqual([
      "product.delete",
      "product.create",
      "product.update",
      "product.create",
      "category.create",
    ]);
    expect(entries[0]!.adminEmail).toBe(`activity-${adminUserId}@indiakitsch.test`);

    // The area filter narrows the list but the tab counts don't move.
    const onlyCategories = await listActivity(
      { area: "categories", adminUserId, dir: "asc", page: 1 },
      db,
    );
    expect(onlyCategories.entries.map((e) => e.action)).toEqual(["category.create"]);
    expect(onlyCategories.areaCounts.all).toBe(5);

    // A date window after everything was written finds nothing.
    const later = await listActivity(
      { area: "all", adminUserId, from: new Date(Date.now() + 60_000), dir: "desc", page: 1 },
      db,
    );
    expect(later.total).toBe(0);

    const { items, categoryNames } = await resolveActivityItems(entries, db);
    // Deleted product: named from its snapshot, no link.
    expect(items.get(entries[0]!.id)).toEqual({ label: "Gone Mug", href: null, deleted: true });
    // Live product: current name and a link.
    expect(items.get(entries[2]!.id)).toEqual({
      label: "Kept Mug",
      href: `/admin/products/${kept.id}`,
      deleted: false,
    });
    expect(items.get(entries[4]!.id)).toMatchObject({ label: "Activity Mugs", deleted: false });
    expect(categoryNames.get(category.id)).toBe("Activity Mugs");
  });
});

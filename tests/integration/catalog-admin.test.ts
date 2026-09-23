/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20).
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { createId } from "@/server/lib/ids";
import {
  createCategory,
  createProduct,
  generateVariantMatrix,
  reorderImages,
  setCategoryActive,
  setProductStatus,
  updateCategory,
  updateImageAlt,
  updateProduct,
} from "@/server/modules/catalog/admin";
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

const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];

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
  if (createdCategoryIds.length > 0) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.entityId, createdCategoryIds));
    await db.delete(schema.products).where(inArray(schema.products.categoryId, createdCategoryIds));
    await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.adminUserId, createdUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
  await client.end();
});

async function createTestCategory(overrides: Partial<{ parentId: string }> = {}) {
  const id = createId();
  const { result } = await createCategory(
    { name: "Test Category", slug: `admin-test-cat-${id.toLowerCase()}`, ...overrides },
    adminUserId,
    db,
  );
  createdCategoryIds.push(result.id);
  return result;
}

describe("createCategory / updateCategory", () => {
  it("creates a category and writes an audit log entry", async () => {
    const category = await createTestCategory();
    expect(category.name).toBe("Test Category");

    const audit = await db.query.auditLog.findFirst({
      where: eq(schema.auditLog.entityId, category.id),
    });
    expect(audit).toMatchObject({ action: "category.create", adminUserId });
  });

  it("enforces 1-level nesting: a child category can't itself be a parent", async () => {
    const parent = await createTestCategory();
    const child = await createTestCategory({ parentId: parent.id });

    await expect(createTestCategory({ parentId: child.id })).rejects.toThrow(/1-level nesting/);
  });

  it("updates fields and records before/after in the audit log", async () => {
    const category = await createTestCategory();
    const { result: updated } = await updateCategory(
      category.id,
      { name: "Renamed" },
      adminUserId,
      db,
    );
    expect(updated.name).toBe("Renamed");

    const audit = await db.query.auditLog.findFirst({
      where: eq(schema.auditLog.entityId, category.id),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
    expect(audit?.action).toBe("category.update");
  });

  it("rejects updating a nonexistent category", async () => {
    await expect(
      updateCategory("does-not-exist", { name: "x" }, adminUserId, db),
    ).rejects.toThrow();
  });
});

describe("setCategoryActive", () => {
  it("toggles isActive and is reflected immediately", async () => {
    const category = await createTestCategory();
    const { result } = await setCategoryActive(category.id, false, adminUserId, db);
    expect(result.isActive).toBe(false);
  });
});

describe("createProduct / updateProduct / setProductStatus", () => {
  it("creates a draft product with no publishedAt", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-product-${id.toLowerCase()}`,
        name: "Test Product",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );
    expect(product.status).toBe("draft");
    expect(product.publishedAt).toBeNull();
  });

  it("sets publishedAt when a product is created directly as active", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-product-${id.toLowerCase()}`,
        name: "Active Product",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
        status: "active",
      },
      adminUserId,
      db,
    );
    expect(product.publishedAt).not.toBeNull();
  });

  it("sets publishedAt the moment a draft product transitions to active", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-product-${id.toLowerCase()}`,
        name: "Draft",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );
    expect(product.publishedAt).toBeNull();

    const { result: activated } = await setProductStatus(product.id, "active", adminUserId, db);
    expect(activated.status).toBe("active");
    expect(activated.publishedAt).not.toBeNull();
  });

  it("rejects a nonexistent category on create", async () => {
    const id = createId();
    await expect(
      createProduct(
        {
          slug: `admin-test-product-${id.toLowerCase()}`,
          name: "X",
          categoryId: "no-such-category",
          pricePaise: 1000,
          gstRateBps: 1200,
        },
        adminUserId,
        db,
      ),
    ).rejects.toThrow();
  });

  it("moves a product to a different category and revalidates both categories' tags", async () => {
    const categoryA = await createTestCategory();
    const categoryB = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-move-${id.toLowerCase()}`,
        name: "Movable",
        categoryId: categoryA.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );

    const { result: moved, revalidateTags } = await updateProduct(
      product.id,
      { categoryId: categoryB.id },
      adminUserId,
      db,
    );
    expect(moved.categoryId).toBe(categoryB.id);
    expect(revalidateTags).toContain(`category:${categoryA.id}`);
    expect(revalidateTags).toContain(`category:${categoryB.id}`);
  });

  it("rejects moving a product to a nonexistent category", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-move2-${id.toLowerCase()}`,
        name: "X",
        categoryId: category.id,
        pricePaise: 1000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );
    await expect(
      updateProduct(product.id, { categoryId: "no-such-category" }, adminUserId, db),
    ).rejects.toThrow();
  });

  it("rejects updating a nonexistent product", async () => {
    await expect(
      updateProduct("no-such-product", { name: "x" }, adminUserId, db),
    ).rejects.toThrow();
  });
});

describe("generateVariantMatrix", () => {
  it("creates every size x color combination with a zero-stock inventory row each", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-matrix-${id.toLowerCase()}`,
        name: "Matrix Product",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );

    const { result } = await generateVariantMatrix(
      {
        productId: product.id,
        sizes: ["S", "M"],
        colors: [{ name: "Red", hex: "#FF0000" }, { name: "Blue" }],
        skuPrefix: "TST",
      },
      adminUserId,
      db,
    );

    expect(result.created).toHaveLength(4); // 2 sizes x 2 colors
    expect(result.skipped).toHaveLength(0);
    expect(result.created.map((v) => v.sku).sort()).toEqual([
      "TST-M-BLUE",
      "TST-M-RED",
      "TST-S-BLUE",
      "TST-S-RED",
    ]);

    for (const variant of result.created) {
      const [inv] = await db
        .select()
        .from(schema.inventory)
        .where(eq(schema.inventory.variantId, variant.id));
      expect(inv).toMatchObject({ onHand: 0, reserved: 0 });
    }
  });

  it("is idempotent: re-running with an overlapping matrix skips existing pairs instead of erroring", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-matrix2-${id.toLowerCase()}`,
        name: "Matrix Product 2",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );

    await generateVariantMatrix(
      { productId: product.id, sizes: ["S"], colors: [{ name: "Red" }], skuPrefix: "IDM" },
      adminUserId,
      db,
    );
    const { result } = await generateVariantMatrix(
      { productId: product.id, sizes: ["S", "M"], colors: [{ name: "Red" }], skuPrefix: "IDM" },
      adminUserId,
      db,
    );

    expect(result.created).toHaveLength(1); // only the new S/M... wait M x Red is new
    expect(result.skipped).toEqual([{ size: "S", color: "Red" }]);
  });
});

describe("updateImageAlt / reorderImages", () => {
  it("updates alt text and reorders a product's images", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-images-${id.toLowerCase()}`,
        name: "Image Product",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );

    const [imgA] = await db
      .insert(schema.productImages)
      .values({
        id: createId(),
        productId: product.id,
        r2Key: "a.webp",
        alt: "A",
        width: 100,
        height: 100,
        sortOrder: 0,
      })
      .returning();
    const [imgB] = await db
      .insert(schema.productImages)
      .values({
        id: createId(),
        productId: product.id,
        r2Key: "b.webp",
        alt: "B",
        width: 100,
        height: 100,
        sortOrder: 1,
      })
      .returning();

    const { result: renamed } = await updateImageAlt(imgA!.id, "New alt text", adminUserId, db);
    expect(renamed.alt).toBe("New alt text");

    await reorderImages(
      { productId: product.id, imageIdsInOrder: [imgB!.id, imgA!.id] },
      adminUserId,
      db,
    );

    const images = await db.query.productImages.findMany({
      where: eq(schema.productImages.productId, product.id),
      orderBy: (i, { asc }) => [asc(i.sortOrder)],
    });
    expect(images.map((i) => i.id)).toEqual([imgB!.id, imgA!.id]);
  });
});

/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20).
 */
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import {
  CategoryNotEmptyError,
  ProductHasOrdersError,
  VariantNotDeletableError,
} from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  createProduct,
  deleteProduct,
  deleteVariant,
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

async function createTestCategory(overrides: Partial<{ name: string }> = {}) {
  const id = createId();
  const { result } = await createCategory(
    { name: "Test Category", slug: `admin-test-cat-${id.toLowerCase()}`, ...overrides },
    adminUserId,
    db,
  );
  createdCategoryIds.push(result.id);
  return result;
}

describe("category order", () => {
  async function orderOf(ids: string[]) {
    const rows = await db
      .select({ id: schema.categories.id, sortOrder: schema.categories.sortOrder })
      .from(schema.categories)
      .where(inArray(schema.categories.id, ids));
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id);
  }

  it("adds new categories to the end of the store order", async () => {
    const first = await createTestCategory();
    const second = await createTestCategory();
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
  });

  it("reorders just the given categories among the slots they hold, leaving others in place", async () => {
    const a = await createTestCategory();
    const b = await createTestCategory();
    const c = await createTestCategory();

    // Only A and C are "on screen" (e.g. a search); C is dragged above A.
    await reorderCategories([c.id, a.id], adminUserId, db);
    expect(await orderOf([a.id, b.id, c.id])).toEqual([c.id, b.id, a.id]);

    // A full-page reorder still works the same way.
    await reorderCategories([b.id, a.id, c.id], adminUserId, db);
    expect(await orderOf([a.id, b.id, c.id])).toEqual([b.id, a.id, c.id]);
  });

  it("rejects unknown or duplicate ids without changing anything", async () => {
    const a = await createTestCategory();
    const b = await createTestCategory();
    const before = await orderOf([a.id, b.id]);
    await expect(reorderCategories([a.id, "no-such-id"], adminUserId, db)).rejects.toThrow();
    await expect(reorderCategories([a.id, a.id], adminUserId, db)).rejects.toThrow();
    expect(await orderOf([a.id, b.id])).toEqual(before);
  });
});

describe("deleteCategory", () => {
  it("deletes an empty category and audits it", async () => {
    const category = await createTestCategory();
    await deleteCategory(category.id, adminUserId, db);

    expect(
      await db.query.categories.findFirst({ where: eq(schema.categories.id, category.id) }),
    ).toBeUndefined();
    const audit = await db.query.auditLog.findFirst({
      where: and(
        eq(schema.auditLog.action, "category.delete"),
        eq(schema.auditLog.entityId, category.id),
      ),
    });
    expect(audit).toMatchObject({ adminUserId });
  });

  it("refuses to delete a category that still has products, leaving both untouched", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-product-${id.toLowerCase()}`,
        name: "Keeps Category",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 1200,
      },
      adminUserId,
      db,
    );

    await expect(deleteCategory(category.id, adminUserId, db)).rejects.toThrow(
      CategoryNotEmptyError,
    );
    expect(
      await db.query.categories.findFirst({ where: eq(schema.categories.id, category.id) }),
    ).toBeDefined();
    expect(
      await db.query.products.findFirst({ where: eq(schema.products.id, product.id) }),
    ).toBeDefined();
  });
});

describe("createCategory / updateCategory", () => {
  it("creates a category and writes an audit log entry", async () => {
    const category = await createTestCategory();
    expect(category.name).toBe("Test Category");

    const audit = await db.query.auditLog.findFirst({
      where: eq(schema.auditLog.entityId, category.id),
    });
    expect(audit).toMatchObject({ action: "category.create", adminUserId });
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

    expect(result.created).toHaveLength(1); // only M x Red is new
    expect(result.skipped).toEqual([{ size: "S", color: "Red" }]);
  });

  it("derives SKUs from the product slug and sets each unit's starting stock", async () => {
    const category = await createTestCategory();
    const id = createId().toLowerCase();
    const slug = `chikankari-suit-${id}`;
    const { result: product } = await createProduct(
      {
        slug,
        name: "Chikankari Suit",
        categoryId: category.id,
        pricePaise: 250000,
        gstRateBps: 500,
      },
      adminUserId,
      db,
    );

    const { result } = await generateVariantMatrix(
      {
        productId: product.id,
        sizes: ["M", "L"],
        colors: [{ name: "Off White", hex: "#F5F0E6" }],
        startingStock: [{ size: "M", color: "Off White", quantity: 12 }],
      },
      adminUserId,
      db,
    );

    const m = result.created.find((v) => v.size === "M")!;
    const l = result.created.find((v) => v.size === "L")!;
    expect(m.sku).toBe(`CHIKANKARI-SUIT-${id.toUpperCase()}-M-OFF-WHITE`);
    expect(m.colorHex).toBe("#F5F0E6");

    const stock = await db.query.inventory.findMany({
      where: inArray(schema.inventory.variantId, [m.id, l.id]),
    });
    expect(stock.find((s) => s.variantId === m.id)).toMatchObject({ onHand: 12, reserved: 0 });
    expect(stock.find((s) => s.variantId === l.id)).toMatchObject({ onHand: 0 });

    // Starting stock is recorded in the unit's history; zero-stock units get no entry.
    const movements = await db.query.stockMovements.findMany({
      where: inArray(schema.stockMovements.variantId, [m.id, l.id]),
    });
    expect(movements).toEqual([
      expect.objectContaining({
        variantId: m.id,
        delta: 12,
        reason: "restock",
        note: "Starting stock",
      }),
    ]);
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
    // The first photo becomes the main one — the cart picks thumbnails by isPrimary.
    expect(images.map((i) => i.isPrimary)).toEqual([true, false]);
  });
});

describe("product slugs", () => {
  it("lowercases a slug with capitals instead of rejecting it, but still rejects spaces", async () => {
    const category = await createTestCategory();
    const id = createId();
    const { result } = await createProduct(
      {
        slug: `Summer-Kurta-${id}`,
        name: "Summer Kurta",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 500,
      },
      adminUserId,
      db,
    );
    expect(result.slug).toBe(`summer-kurta-${id.toLowerCase()}`);
    await expect(
      updateProduct(result.id, { slug: "summer kurta" }, adminUserId, db),
    ).rejects.toThrow();
  });
});

describe("deleteProduct", () => {
  async function productWithVariantAndPhoto() {
    const category = await createTestCategory();
    const id = createId().toLowerCase();
    const { result: product } = await createProduct(
      {
        slug: `admin-test-delete-${id}`,
        name: "Delete Me",
        categoryId: category.id,
        pricePaise: 100000,
        gstRateBps: 500,
      },
      adminUserId,
      db,
    );
    const { result } = await generateVariantMatrix(
      {
        productId: product.id,
        sizes: ["M"],
        colors: [{ name: "Red" }],
        startingStock: [{ size: "M", color: "Red", quantity: 4 }],
      },
      adminUserId,
      db,
    );
    await db.insert(schema.productImages).values({
      id: createId(),
      productId: product.id,
      r2Key: `products/${product.id}/photo.webp`,
      alt: "Photo",
      width: 100,
      height: 100,
    });
    return { product, variant: result.created[0]! };
  }

  it("deletes a never-ordered product with its sizes, stock and photos, returning the photo keys", async () => {
    const { product, variant } = await productWithVariantAndPhoto();

    const { result } = await deleteProduct(product.id, adminUserId, db);
    expect(result.imageKeys).toEqual([`products/${product.id}/photo.webp`]);

    expect(
      await db.query.products.findFirst({ where: eq(schema.products.id, product.id) }),
    ).toBeUndefined();
    expect(
      await db.query.inventory.findFirst({ where: eq(schema.inventory.variantId, variant.id) }),
    ).toBeUndefined();
    const audit = await db.query.auditLog.findFirst({
      where: and(
        eq(schema.auditLog.action, "product.delete"),
        eq(schema.auditLog.entityId, product.id),
      ),
    });
    expect(audit).toMatchObject({ adminUserId });
  });

  it("deletes a never-ordered size & colour with its stock, and refuses one in checkout or ordered", async () => {
    const { product, variant } = await productWithVariantAndPhoto();

    // In checkout: units held → refused, nothing removed.
    await db
      .update(schema.inventory)
      .set({ reserved: 1 })
      .where(eq(schema.inventory.variantId, variant.id));
    await expect(deleteVariant(variant.id, adminUserId, db)).rejects.toThrow(
      VariantNotDeletableError,
    );
    await db
      .update(schema.inventory)
      .set({ reserved: 0 })
      .where(eq(schema.inventory.variantId, variant.id));

    await deleteVariant(variant.id, adminUserId, db);
    expect(
      await db.query.productVariants.findFirst({
        where: eq(schema.productVariants.id, variant.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.inventory.findFirst({ where: eq(schema.inventory.variantId, variant.id) }),
    ).toBeUndefined();
    // The product itself stays.
    expect(
      await db.query.products.findFirst({ where: eq(schema.products.id, product.id) }),
    ).toBeDefined();
  });

  it("refuses to delete a product that has been ordered", async () => {
    const { product, variant } = await productWithVariantAndPhoto();
    const orderId = createId();
    await db.insert(schema.orders).values({
      id: orderId,
      userId: adminUserId,
      status: "paid",
      subtotalPaise: 100000,
      totalPaise: 100000,
      shipFullName: "Jane",
      shipPhone: "9999999999",
      shipLine1: "1 Test St",
      shipCity: "Mumbai",
      shipState: "MH",
      shipPincode: "400001",
      customerEmail: `order-${orderId}@indiakitsch.test`,
      customerPhone: "9999999999",
    });
    await db.insert(schema.orderItems).values({
      orderId,
      variantId: variant.id,
      productName: "Delete Me",
      sku: variant.sku,
      size: "M",
      color: "Red",
      quantity: 1,
      unitPricePaise: 100000,
      lineTotalPaise: 100000,
      gstRateBps: 500,
    });
    try {
      await expect(deleteProduct(product.id, adminUserId, db)).rejects.toThrow(
        ProductHasOrdersError,
      );
      // Its ordered size & colour can't be deleted either — only paused.
      await expect(deleteVariant(variant.id, adminUserId, db)).rejects.toThrow(
        VariantNotDeletableError,
      );
      expect(
        await db.query.products.findFirst({ where: eq(schema.products.id, product.id) }),
      ).toBeDefined();
    } finally {
      await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    }
  });
});

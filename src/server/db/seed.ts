/**
 * Local/staging seed data - never run against production. Populates
 * enough of the catalog to build and test the public storefront and
 * admin panel against: categories, ~20 products with variants and stock,
 * a couple of test coupons. See docs/10 §22 Phase 1 and docs/12.
 *
 * Does NOT create a user or admin account - Better Auth owns password
 * hashing, so an admin is created through its real signup flow via
 * scripts/create-admin.ts (Phase 3), not by inserting a row here.
 *
 * Run with: npx tsx src/server/db/seed.ts
 *
 * Builds its own connection rather than importing `./client`: that file
 * carries `import "server-only"`, which is correct for the real app (it
 * must never end up in a client bundle) but breaks under plain Node/tsx,
 * which this script - unlike the Next.js app - runs under directly.
 *
 * Everything runs inside one transaction, so a failure partway through
 * (as happened once already - see the SKU comment below) can't leave
 * half-seeded data behind for the next run to collide with.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories, inventory, products, productVariants, sizeCharts } from "./schema";
import * as schema from "./schema";
import { createId } from "@/server/lib/ids";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const SIZES = ["S", "M", "L", "XL"] as const;
const COLORS: { name: string; hex: string }[] = [
  { name: "Maroon", hex: "#7b1e3a" },
  { name: "Mustard", hex: "#d4a017" },
  { name: "Indigo", hex: "#2a3d66" },
  { name: "Ivory", hex: "#f4f1e8" },
];

const CATEGORY_DEFS = [
  { name: "Kurtas", slug: "kurtas" },
  { name: "Sarees", slug: "sarees" },
  { name: "Dresses", slug: "dresses" },
  { name: "Co-ord Sets", slug: "co-ord-sets" },
] as const;

const PRODUCT_NAME_TEMPLATES: Record<string, string[]> = {
  kurtas: ["Block Print Cotton Kurta", "Chikankari Straight Kurta", "Embroidered A-Line Kurta"],
  sarees: ["Banarasi Silk Saree", "Chanderi Handloom Saree", "Linen Blend Saree"],
  dresses: ["Ikat Print Midi Dress", "Tiered Cotton Dress", "Bandhani Wrap Dress"],
  "co-ord-sets": ["Printed Co-ord Set", "Linen Shirt & Pant Set", "Embroidered Kurta Set"],
};

function slugify(text: string, suffix: string): string {
  return `${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${suffix.toLowerCase()}`;
}

db.transaction(async (tx) => {
  console.log("→ Seeding size chart...");
  const [sizeChart] = await tx
    .insert(sizeCharts)
    .values({
      id: createId(),
      name: "Standard Women's Apparel",
      unit: "in",
      columns: ["Size", "Bust", "Waist", "Hip"],
      rows: [
        { Size: "S", Bust: "34", Waist: "28", Hip: "37" },
        { Size: "M", Bust: "36", Waist: "30", Hip: "39" },
        { Size: "L", Bust: "38", Waist: "32", Hip: "41" },
        { Size: "XL", Bust: "40", Waist: "34", Hip: "43" },
      ],
    })
    .returning();

  console.log("→ Seeding categories...");
  const cats = await tx
    .insert(categories)
    .values(
      CATEGORY_DEFS.map((c, i) => ({
        id: createId(),
        name: c.name,
        slug: c.slug,
        sortOrder: i,
      })),
    )
    .returning();

  console.log("→ Seeding products, variants, inventory...");
  let productCount = 0;
  let variantCount = 0;

  for (const category of cats) {
    const templates = PRODUCT_NAME_TEMPLATES[category.slug] ?? ["Sample Product"];

    for (let i = 0; i < 5; i++) {
      const name = `${templates[i % templates.length]} ${i + 1}`;
      const pricePaise = 149900 + i * 20000; // ₹1,499 upward
      const mrpPaise = pricePaise + 60000;

      const [product] = await tx
        .insert(products)
        .values({
          id: createId(),
          slug: slugify(name, createId().slice(-6)),
          name,
          description: `A ${name.toLowerCase()} from the India Kitsch collection - seed data, not real copy.`,
          categoryId: category.id,
          sizeChartId: sizeChart.id,
          pricePaise,
          mrpPaise,
          gstRateBps: 500, // 5% - apparel slab; confirm the real rate with a CA (docs/11 §27)
          hsnCode: "6204",
          status: "active",
          isFeatured: i === 0,
          publishedAt: new Date(),
        })
        .returning();
      productCount++;

      // `product.id.slice(-6)` (not the slug) as the SKU's per-product
      // prefix: it's globally unique by construction (ULIDs never
      // collide), whereas truncating the slug to a fixed width isn't -
      // several products with similar names truncated to the same
      // prefix and collided against the sku unique constraint on the
      // first version of this script.
      const variantRows = SIZES.flatMap((size) =>
        COLORS.slice(0, 2 + (i % 2)).map((color) => ({
          id: createId(),
          productId: product.id,
          sku: `${product.id.slice(-6).toUpperCase()}-${size}-${color.name.slice(0, 3).toUpperCase()}`,
          size,
          color: color.name,
          colorHex: color.hex,
        })),
      );

      const insertedVariants = await tx.insert(productVariants).values(variantRows).returning();
      variantCount += insertedVariants.length;

      await tx.insert(inventory).values(
        insertedVariants.map((v, idx) => ({
          variantId: v.id,
          onHand: idx === 0 ? 0 : 10 + idx * 3, // first variant of each product is out of stock, on purpose
          reserved: 0,
        })),
      );
    }
  }

  console.log(
    `\nSeeded: ${cats.length} categories, ${productCount} products, ${variantCount} variants.`,
  );
})
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed, transaction rolled back:", error);
    await client.end();
    process.exit(1);
  });

/**
 * Demo order history for the admin dashboard - spreads paid orders across
 * the last ~90 days (for the revenue/orders trend charts) and leaves a
 * handful very recent and still `paid` (for the "Needs processing" panel).
 * Never run against production.
 *
 * Requires the catalog seed (`src/server/db/seed.ts`) to have already run -
 * this script only reads existing products/variants, it doesn't create any.
 *
 * Builds its own connection rather than importing `./client`, and inserts
 * rows directly rather than calling the real `createOrder`/`markOrderPaid`
 * service functions: those live in files with `import "server-only"`,
 * which throws unconditionally under plain Node/tsx (confirmed directly -
 * see docs/09's Phase 8 notes), the same reason `seed.ts` avoids them too.
 * This is seed data, not a checkout - the real order flow is already
 * covered by the integration tests; this script only needs to produce
 * rows the dashboard's queries can read, with real stock actually
 * decremented so inventory numbers stay honest.
 *
 * Run with: npx tsx src/server/db/seed-orders.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createId } from "@/server/lib/ids";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const SHIPPING_PAISE = 9900;
const HISTORICAL_ORDERS = 70;
const RECENT_PAID_ORDERS = 8;
const LOOKBACK_DAYS = 90;

const CUSTOMER_DEFS = [
  { email: "seed-customer-1@indiakitsch.test", name: "Ananya Rao" },
  { email: "seed-customer-2@indiakitsch.test", name: "Priya Menon" },
  { email: "seed-customer-3@indiakitsch.test", name: "Kavya Iyer" },
  { email: "seed-customer-4@indiakitsch.test", name: "Sneha Reddy" },
  { email: "seed-customer-5@indiakitsch.test", name: "Divya Nair" },
] as const;

const CITY_DEFS = [
  { city: "Mumbai", state: "MH", pincode: "400001" },
  { city: "Bengaluru", state: "KA", pincode: "560001" },
  { city: "Delhi", state: "DL", pincode: "110001" },
  { city: "Chennai", state: "TN", pincode: "600001" },
  { city: "Pune", state: "MH", pincode: "411001" },
] as const;

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}
function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)]!;
}

async function ensureCustomers(): Promise<{ id: string; email: string; name: string }[]> {
  const existing = await db.query.user.findMany({
    where: inArray(
      schema.user.email,
      CUSTOMER_DEFS.map((c) => c.email),
    ),
  });
  const existingEmails = new Set(existing.map((u) => u.email));
  const toCreate = CUSTOMER_DEFS.filter((c) => !existingEmails.has(c.email));

  const created =
    toCreate.length > 0
      ? await db
          .insert(schema.user)
          .values(
            toCreate.map((c) => ({
              id: createId(),
              name: c.name,
              email: c.email,
              emailVerified: true,
            })),
          )
          .returning()
      : [];

  return [...existing, ...created].map((u) => ({ id: u.id, email: u.email, name: u.name }));
}

async function ensureAddresses(
  customers: { id: string; name: string }[],
): Promise<Map<string, string>> {
  const addressByUser = new Map<string, string>();
  for (const customer of customers) {
    const existing = await db.query.addresses.findFirst({
      where: eq(schema.addresses.userId, customer.id),
    });
    if (existing) {
      addressByUser.set(customer.id, existing.id);
      continue;
    }
    const place = pick(CITY_DEFS);
    const [address] = await db
      .insert(schema.addresses)
      .values({
        id: createId(),
        userId: customer.id,
        fullName: customer.name,
        phone: "9" + String(100000000 + randomInt(899999999)),
        line1: `${1 + randomInt(200)} Seed Layout`,
        city: place.city,
        state: place.state,
        pincode: place.pincode,
      })
      .returning();
    addressByUser.set(customer.id, address!.id);
  }
  return addressByUser;
}

interface CatalogLine {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPricePaise: number;
  mrpPaise: number | null;
  gstRateBps: number;
  available: number; // mutated as the script "sells" stock
}

async function loadCatalogPool(): Promise<CatalogLine[]> {
  const rows = await db
    .select({
      variantId: schema.productVariants.id,
      productName: schema.products.name,
      sku: schema.productVariants.sku,
      size: schema.productVariants.size,
      color: schema.productVariants.color,
      pricePaise: schema.products.pricePaise,
      mrpPaise: schema.products.mrpPaise,
      gstRateBps: schema.products.gstRateBps,
      onHand: schema.inventory.onHand,
      reserved: schema.inventory.reserved,
    })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .innerJoin(schema.inventory, eq(schema.inventory.variantId, schema.productVariants.id))
    .where(
      and(
        eq(schema.products.status, "active"),
        gt(schema.inventory.onHand, schema.inventory.reserved),
      ),
    );

  return rows.map((r) => ({
    variantId: r.variantId,
    productName: r.productName,
    sku: r.sku,
    size: r.size,
    color: r.color,
    unitPricePaise: r.pricePaise,
    mrpPaise: r.mrpPaise,
    gstRateBps: r.gstRateBps,
    available: r.onHand - r.reserved,
  }));
}

function taxIncludedFor(lineTotalPaise: number, gstRateBps: number): number {
  const divisor = 1 + gstRateBps / 10_000;
  return Math.round(lineTotalPaise - lineTotalPaise / divisor);
}

async function createSeedOrder(
  pool: CatalogLine[],
  customer: { id: string; email: string },
  addressId: string,
  placedAt: Date,
  finalStatus: "paid" | "processing" | "shipped" | "delivered" | "cancelled",
): Promise<boolean> {
  const address = (await db.query.addresses.findFirst({
    where: eq(schema.addresses.id, addressId),
  }))!;

  const lineCount = 1 + (Math.random() < 0.35 ? 1 : 0);
  const chosen: { line: CatalogLine; quantity: number }[] = [];
  const candidates = pool.filter((l) => l.available > 0);
  for (let i = 0; i < lineCount && candidates.length > 0; i++) {
    const idx = randomInt(candidates.length);
    const line = candidates[idx]!;
    const quantity = Math.min(line.available, 1 + randomInt(2));
    if (quantity <= 0) continue;
    chosen.push({ line, quantity });
    line.available -= quantity;
    if (line.available <= 0) candidates.splice(idx, 1);
  }
  if (chosen.length === 0) return false;

  const subtotalPaise = chosen.reduce((sum, c) => sum + c.line.unitPricePaise * c.quantity, 0);
  const taxIncludedPaise = chosen.reduce(
    (sum, c) => sum + taxIncludedFor(c.line.unitPricePaise * c.quantity, c.line.gstRateBps),
    0,
  );
  const isCancelled = finalStatus === "cancelled";
  const shippingPaise = isCancelled ? 0 : SHIPPING_PAISE;
  const totalPaise = isCancelled ? 0 : subtotalPaise + shippingPaise;

  const orderId = createId();
  const paidAt = isCancelled ? null : new Date(placedAt.getTime() + 3 * 60_000);

  await db.insert(schema.orders).values({
    id: orderId,
    userId: customer.id,
    status: finalStatus,
    subtotalPaise: isCancelled ? 0 : subtotalPaise,
    shippingPaise,
    taxIncludedPaise: isCancelled ? 0 : taxIncludedPaise,
    totalPaise,
    shipFullName: address.fullName,
    shipPhone: address.phone,
    shipLine1: address.line1,
    shipLine2: address.line2,
    shipCity: address.city,
    shipState: address.state,
    shipPincode: address.pincode,
    customerEmail: customer.email,
    customerPhone: address.phone,
    razorpayOrderId: `seed_ord_${createId()}`,
    placedAt,
    paidAt: paidAt ?? undefined,
    shippedAt: ["shipped", "delivered"].includes(finalStatus) ? paidAt! : undefined,
    deliveredAt: finalStatus === "delivered" ? paidAt! : undefined,
    cancelledAt: isCancelled ? placedAt : undefined,
    // The real marker for a checkout that expired unpaid (shown as "Not paid").
    cancelReason: isCancelled ? "expired" : undefined,
    createdAt: placedAt,
  });

  await db.insert(schema.orderItems).values(
    chosen.map(({ line, quantity }) => ({
      orderId,
      variantId: line.variantId,
      productName: line.productName,
      sku: line.sku,
      size: line.size,
      color: line.color,
      unitPricePaise: line.unitPricePaise,
      mrpPaise: line.mrpPaise,
      quantity,
      gstRateBps: line.gstRateBps,
      lineTotalPaise: line.unitPricePaise * quantity,
    })),
  );

  await db.insert(schema.orderEvents).values({
    orderId,
    fromStatus: null,
    toStatus: finalStatus,
    actor: "system",
    note: "seed data",
  });

  if (!isCancelled) {
    await db.insert(schema.payments).values({
      orderId,
      razorpayOrderId: `seed_ord_${orderId}`,
      razorpayPaymentId: `seed_pay_${createId()}`,
      status: "captured",
      amountPaise: totalPaise,
      method: pick(["card", "upi", "netbanking"]),
    });

    await db.insert(schema.stockMovements).values(
      chosen.map(({ line, quantity }) => ({
        variantId: line.variantId,
        delta: -quantity,
        reason: "sale" as const,
        orderId,
        note: "seed data",
      })),
    );

    for (const { line, quantity } of chosen) {
      await db
        .update(schema.inventory)
        .set({ onHand: sql`${schema.inventory.onHand} - ${quantity}` })
        .where(eq(schema.inventory.variantId, line.variantId));
    }
  }

  return true;
}

function pickTerminalStatus(): "processing" | "shipped" | "delivered" | "cancelled" {
  const roll = Math.random();
  if (roll < 0.05) return "cancelled";
  if (roll < 0.15) return "processing";
  if (roll < 0.3) return "shipped";
  return "delivered";
}

async function main() {
  console.log("→ Loading customers, addresses, and catalog...");
  const customers = await ensureCustomers();
  const addressByUser = await ensureAddresses(customers);
  const pool = await loadCatalogPool();
  if (pool.length === 0) {
    throw new Error("No in-stock active products found - run `npm run db:seed` first.");
  }
  console.log(`  ${customers.length} customers, ${pool.length} in-stock variants available.`);

  let created = 0;
  let revenuePaise = 0;

  console.log(
    `→ Seeding ${HISTORICAL_ORDERS} historical orders over the last ${LOOKBACK_DAYS} days...`,
  );
  for (let i = 0; i < HISTORICAL_ORDERS; i++) {
    const customer = pick(customers);
    const daysAgo = 2 + randomInt(LOOKBACK_DAYS - 2);
    const placedAt = new Date();
    placedAt.setDate(placedAt.getDate() - daysAgo);
    placedAt.setHours(9 + randomInt(11), randomInt(60), 0, 0);

    const status = pickTerminalStatus();
    const ok = await createSeedOrder(
      pool,
      customer,
      addressByUser.get(customer.id)!,
      placedAt,
      status,
    );
    if (ok) created++;
  }

  console.log(`→ Seeding ${RECENT_PAID_ORDERS} recent orders still awaiting processing...`);
  for (let i = 0; i < RECENT_PAID_ORDERS; i++) {
    const customer = pick(customers);
    const hoursAgo = randomInt(30);
    const placedAt = new Date(Date.now() - hoursAgo * 60 * 60_000);

    const ok = await createSeedOrder(
      pool,
      customer,
      addressByUser.get(customer.id)!,
      placedAt,
      "paid",
    );
    if (ok) created++;
  }

  const revenueRow = await db
    .select({ total: sql<number>`coalesce(sum(${schema.orders.totalPaise}), 0)::int` })
    .from(schema.orders)
    .where(sql`${schema.orders.razorpayOrderId} like 'seed_ord_%'`);
  revenuePaise = revenueRow[0]?.total ?? 0;

  console.log(
    `\nSeeded ${created} orders (${(revenuePaise / 100).toFixed(2)} INR total across all seed orders).`,
  );
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

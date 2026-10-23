/**
 * Demo coupons for the admin Coupons page - 30 codes covering every derived
 * status (live, scheduled, expired, used up, inactive), both discount types,
 * with/without caps, limits and date windows, and creation times spread
 * over the last ~60 days so the Created column and pagination have
 * something real to show. Never run against production.
 *
 * Idempotent: codes are fixed and inserted with ON CONFLICT DO NOTHING, so a
 * re-run only adds whichever are missing.
 *
 * Inserts rows directly (no `createCoupon`, which is `server-only` - see
 * seed-orders.ts's header for why), so no `coupon.create` audit rows are
 * written; `created_by_admin_id` is set directly to an existing admin.
 *
 * Run with: npx tsx src/server/db/seed-coupons.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createId } from "@/server/lib/ids";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const DAY_MS = 86_400_000;

type Kind = "live" | "scheduled" | "expired" | "used_up" | "inactive";

// 30 codes, cycling through the five statuses so every one appears 6 times.
const CODES = [
  "WELCOME10",
  "DIWALI25",
  "HOLI15",
  "SUMMER20",
  "FLAT200",
  "KITSCH30",
  "NEWDROP10",
  "FESTIVE500",
  "MONSOON12",
  "EID20",
  "FIRSTORDER",
  "PONGAL150",
  "RAKHI18",
  "ONAM300",
  "NAVRATRI22",
  "SALE40",
  "FREESHIP99",
  "LOYAL15",
  "BIRTHDAY250",
  "WEEKEND10",
  "CLEARANCE35",
  "INSTA15",
  "FRIENDS100",
  "VIP25",
  "NEWYEAR26",
  "REPUBLIC26",
  "BULK400",
  "STUDENT12",
  "COMEBACK20",
  "LASTCALL50",
] as const;
const KINDS: Kind[] = ["live", "scheduled", "expired", "used_up", "inactive"];

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function couponFor(code: string, index: number, adminIds: string[], now: number) {
  const kind = KINDS[index % KINDS.length]!;
  // A trailing number in the code doubles as its value: <= 50 → percent, else fixed rupees.
  const trailing = Number(code.match(/(\d+)$/)?.[1] ?? 10);
  const isPercent = trailing <= 50;
  const createdAt = new Date(now - (60 - index * 2) * DAY_MS - randomInt(8) * 3_600_000);

  const maxUses = kind === "used_up" ? 20 + randomInt(80) : index % 3 === 0 ? 500 : null;

  return {
    id: createId(),
    code,
    type: isPercent ? ("percent" as const) : ("fixed" as const),
    valueBps: isPercent ? trailing * 100 : null,
    valuePaise: isPercent ? null : trailing * 100,
    minSubtotalPaise: [0, 49_900, 99_900, 149_900][index % 4]!,
    maxDiscountPaise: isPercent && index % 2 === 0 ? [20_000, 50_000, 100_000][index % 3]! : null,
    startsAt:
      kind === "scheduled"
        ? new Date(now + (3 + randomInt(20)) * DAY_MS)
        : index % 4 === 1
          ? new Date(createdAt.getTime() + DAY_MS)
          : null,
    endsAt:
      kind === "expired"
        ? new Date(now - (1 + randomInt(10)) * DAY_MS)
        : kind === "scheduled" || index % 3 === 1
          ? new Date(now + (30 + randomInt(60)) * DAY_MS)
          : null,
    maxUses,
    usedCount:
      kind === "used_up" ? maxUses! : maxUses ? randomInt(Math.min(maxUses, 120)) : randomInt(60),
    perUserLimit: index % 5 === 2 ? 1 : null,
    isActive: kind !== "inactive",
    // Most coupons get a creator; every 7th is left null like a coupon seeded outside the UI.
    createdByAdminId: index % 7 === 6 ? null : (adminIds[index % adminIds.length] ?? null),
    createdAt,
    updatedAt: createdAt,
  };
}

async function main() {
  const admins = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));
  if (admins.length === 0)
    console.warn("No admin users found - seeding coupons without a creator.");

  const now = Date.now();
  const rows = CODES.map((code, i) =>
    couponFor(
      code,
      i,
      admins.map((a) => a.id),
      now,
    ),
  );

  const inserted = await db
    .insert(schema.coupons)
    .values(rows)
    .onConflictDoNothing({ target: schema.coupons.code })
    .returning({ code: schema.coupons.code });

  console.log(
    `Seeded ${inserted.length} coupons (${CODES.length - inserted.length} already existed). Creators: ${
      admins.map((a) => a.email).join(", ") || "none"
    }.`,
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

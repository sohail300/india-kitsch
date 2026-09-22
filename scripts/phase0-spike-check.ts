/**
 * One-off Phase 0 spike check — not part of the app. Proves:
 *  1. A real interactive transaction works through Supabase's transaction
 *     pooler with prepared statements disabled (docs/01 §0 point 7, §11).
 *  2. The keepalive.ping row is readable exactly as the daily keep-alive
 *     ping will read it.
 *
 * Run with: npx tsx scripts/phase0-spike-check.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set in .env.local");

  const sql = postgres(databaseUrl, { prepare: false });

  try {
    console.log("→ Running a real transaction via the transaction pooler...");
    const result = await sql.begin(async (tx) => {
      const [row] = await tx`select 1 + 1 as sum`;
      return row;
    });
    console.log(`  ✓ transaction committed, 1 + 1 = ${result.sum}`);

    console.log("→ Reading keepalive.ping...");
    const [ping] = await sql`select id, ok from keepalive.ping where id = 1`;
    if (!ping) throw new Error("keepalive.ping has no row with id = 1 — did the migration run?");
    console.log(`  ✓ keepalive.ping row: id=${ping.id} ok=${ping.ok}`);

    console.log("\nAll Phase 0 database checks passed.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Phase 0 spike check failed:", error);
  process.exit(1);
});

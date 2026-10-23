import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/**
 * Runs a real query through the transaction pooler - for manual checks
 * or infrequent polling only (docs/08 §21 says "every ~5 minutes" at
 * most), never the primary uptime check (that's the DB-free
 * /api/health). A database query naturally keeps this out of the
 * prerendered/static path (docs on Route Handlers + Cache Components).
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "reachable", time: new Date().toISOString() });
  } catch (error) {
    console.error("Deep health check failed:", error);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}

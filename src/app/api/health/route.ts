import { connection } from "next/server";

/**
 * Liveness only - no DB. This is what the uptime monitor hits (docs/08
 * §21), and it's deliberately DB-free so polling it never touches
 * Supabase. `connection()` forces this to run at request time rather
 * than being served as a static build-time response, so it actually
 * proves the current deployment is alive, not just that one existed at
 * build time.
 */
export async function GET() {
  await connection();
  return Response.json({ status: "ok", time: new Date().toISOString() });
}

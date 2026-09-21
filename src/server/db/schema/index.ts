import { boolean, integer, pgSchema } from "drizzle-orm/pg-core";

/**
 * No `import "server-only"` here deliberately: this file is table
 * definitions only (no secrets, no connection logic), and it must stay
 * loadable by the drizzle-kit CLI, which requires it directly through
 * plain Node — `server-only`'s guard only works inside Next.js's own
 * webpack build, so it breaks any other tool that imports this file
 * (drizzle-kit, Vitest). The real connection lives in `db/client.ts`,
 * which *does* carry the guard.
 *
 * All application (business) tables live in this private Postgres schema,
 * not `public`. Supabase's REST/Data API only exposes schemas on its
 * "exposed schemas" allowlist — `app` is deliberately left off that list,
 * with RLS enabled and no policies, so the public anon key can never read
 * or write anything here even if it leaked. See docs/03 §4 and docs/04 §14.
 *
 * Real business tables (users, products, orders, ...) are added here in
 * Phase 1 — this file is currently just the schema-lockdown scaffolding
 * from Phase 0.
 */
export const appSchema = pgSchema("app");

/**
 * The *only* schema exposed to Supabase's REST API. Holds nothing but a
 * one-row table the daily keep-alive ping reads, so the anon key it uses
 * can never see anything sensitive. See docs/08 §18 and docs/11 §27.
 */
export const keepaliveSchema = pgSchema("keepalive");

export const ping = keepaliveSchema.table("ping", {
  id: integer("id").primaryKey(),
  ok: boolean("ok").notNull().default(true),
});

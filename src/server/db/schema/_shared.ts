import { boolean, integer, pgSchema } from "drizzle-orm/pg-core";

/**
 * All application (business) tables live in this private Postgres schema,
 * not `public`. Supabase's REST/Data API only exposes schemas on its
 * "exposed schemas" allowlist - `app` is deliberately left off that list,
 * with RLS enabled and no policies, so the public anon key can never read
 * or write anything here even if it leaked. See docs/03 §4 and docs/04 §14.
 *
 * Every schema file under this directory imports `appSchema` from here -
 * never declares its own `pgSchema("app")` - so there's one physical
 * reference, not several. (Better Auth's CLI generates its own; that got
 * edited to import from here instead - see schema/auth.ts.)
 *
 * No `import "server-only"` in this directory's files: they must stay
 * loadable by the drizzle-kit and better-auth CLIs, which load them
 * directly through plain Node - `server-only`'s guard only works inside
 * Next.js's own webpack build. The real connections (`db/client.ts`,
 * `auth/auth.ts`) do carry the guard.
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

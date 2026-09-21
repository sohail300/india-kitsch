-- Locks down what Supabase's REST/Data API can see, per docs/03 §4 and
-- docs/04 §14. Only `keepalive.ping` is ever reachable over REST; the
-- `app` schema (all future business tables) is invisible to it even if the
-- anon key leaks, or `app` is ever accidentally added to Supabase's
-- exposed-schemas list.
--
-- Note: this still requires the exposed-schemas list itself (Project
-- Settings -> API -> Exposed schemas) to contain `keepalive` and NOT
-- `public`/`app` -- that setting lives in Supabase's dashboard, not in SQL,
-- and isn't set by this migration.

-- `app` schema: nothing granted to Supabase's REST roles at all, at the
-- schema level, so even a table `anon`/`authenticated` could otherwise see
-- (e.g. if `app` were ever exposed by mistake) stays unreachable.
REVOKE ALL ON SCHEMA "app" FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "app" REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "app" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "app" REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
--> statement-breakpoint

-- `keepalive` schema: only the one table, only SELECT, only for `anon`.
GRANT USAGE ON SCHEMA "keepalive" TO anon;
--> statement-breakpoint
ALTER TABLE "keepalive"."ping" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "anon can read the keep-alive row" ON "keepalive"."ping"
  FOR SELECT
  TO anon
  USING (true);
--> statement-breakpoint
GRANT SELECT ON "keepalive"."ping" TO anon;
--> statement-breakpoint

-- The single row the daily keep-alive ping reads (see docs/08 §18).
INSERT INTO "keepalive"."ping" ("id", "ok") VALUES (1, true)
ON CONFLICT ("id") DO NOTHING;

-- Trigram index backing the v1 catalog search (docs/03 §4 "Search",
-- docs/05 §7). Not expressible through Drizzle's typed index API (it has
-- no `gin_trgm_ops` operator class support), so it's hand-written here —
-- see the comment at the top of src/server/db/schema/catalog.ts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "app"."products" USING gin (lower("name") gin_trgm_ops);

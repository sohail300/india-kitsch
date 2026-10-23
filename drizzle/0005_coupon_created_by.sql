ALTER TABLE "app"."coupons" ADD COLUMN "created_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_created_by_admin_id_user_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill from the audit trail: every coupon made through the admin UI has
-- a `coupon.create` row naming its admin (docs/07 §13). Coupons without one
-- (seeded directly) stay NULL.
UPDATE "app"."coupons" AS c
SET "created_by_admin_id" = a."admin_user_id"
FROM "app"."audit_log" AS a
WHERE a."action" = 'coupon.create'
  AND a."entity_type" = 'coupon'
  AND a."entity_id" = c."id";

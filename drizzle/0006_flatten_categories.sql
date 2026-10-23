-- Categories become a flat list (no sub-categories). Nothing is deleted:
-- former sub-categories simply become regular categories. First renumber
-- sort_order across the whole list so each former child sits right after
-- its old parent, in its old order — the children's per-parent numbers
-- would otherwise collide with the top-level ones.
UPDATE "app"."categories" AS c
SET "sort_order" = ordered.position
FROM (
  SELECT
    child."id",
    (row_number() OVER (
      ORDER BY
        coalesce(parent."sort_order", child."sort_order"),
        coalesce(parent."name", child."name"),
        (child."parent_id" IS NOT NULL),
        child."sort_order",
        child."name"
    ) - 1)::int AS position
  FROM "app"."categories" AS child
  LEFT JOIN "app"."categories" AS parent ON parent."id" = child."parent_id"
) AS ordered
WHERE ordered."id" = c."id";
--> statement-breakpoint
ALTER TABLE "app"."categories" DROP CONSTRAINT "categories_parent_id_categories_id_fk";--> statement-breakpoint
DROP INDEX "app"."categories_parent_id_idx";--> statement-breakpoint
ALTER TABLE "app"."categories" DROP COLUMN "parent_id";

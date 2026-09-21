CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "keepalive";
--> statement-breakpoint
CREATE TABLE "keepalive"."ping" (
	"id" integer PRIMARY KEY NOT NULL,
	"ok" boolean DEFAULT true NOT NULL
);

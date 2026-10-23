import { boolean, index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { appSchema } from "./_shared";
import { user } from "./auth";
import { createId } from "@/server/lib/ids";

/** docs/03 §4 "Misc": store_settings, contact_messages, audit_log. */

export const storeSettings = appSchema.table("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactMessages = appSchema.table("contact_messages", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message").notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin mutations: who/what/before/after (docs/03 §4).
export const auditLog = appSchema.table(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Back the admin Activity log: newest-first paging, the area/item filter
  // and the admin filter (docs/07 §13).
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_admin_user_id_idx").on(table.adminUserId),
  ],
);

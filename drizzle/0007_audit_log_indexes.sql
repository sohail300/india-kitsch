CREATE INDEX "audit_log_created_at_idx" ON "app"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "app"."audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_admin_user_id_idx" ON "app"."audit_log" USING btree ("admin_user_id");
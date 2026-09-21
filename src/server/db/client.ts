import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/lib/env";
import * as schema from "./schema";

/**
 * The app's only database connection: Supabase's transaction pooler.
 * Interactive transactions work; prepared statements don't, so they're
 * disabled here. Migrations and dumps use the *session* pooler instead,
 * from CI, never from this file. See docs/01 §0/§2 and docs/03 §11.
 */
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });

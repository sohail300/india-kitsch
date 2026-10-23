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

/** The type of `db` itself - accepted by read-only query functions as an optional, injectable handle (see `DbOrTx` below). */
export type Db = typeof db;

/**
 * The transaction handle `db.transaction(async (tx) => ...)` hands to its
 * callback. Modules that need to run inside a caller-supplied transaction
 * (e.g. inventory reservation, called from checkout's order-creation
 * transaction) take this type instead of importing `db` directly, so they
 * compose into one transaction rather than opening their own.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Accepted by read-only query functions as an optional last argument,
 * defaulting to the real `db` singleton. Production call sites never pass
 * it; integration tests do, pointing the same query functions at
 * TEST_DATABASE_URL (local/CI Postgres, docs/09 §20) instead of Supabase.
 */
export type DbOrTx = Db | Tx;

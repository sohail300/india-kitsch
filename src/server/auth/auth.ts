import "server-only";
import { db } from "@/server/db/client";
import { env } from "@/server/lib/env";
import { buildAuth } from "./config";

/**
 * The real app's Better Auth instance — the only thing in this file is
 * wiring the guarded `db`/`env` singletons into the shared, guard-free
 * config builder (./config.ts). scripts/create-admin.ts builds its own
 * instance the same way, with its own lightweight connection, since it
 * can't import this file directly (server-only breaks under plain tsx —
 * see db/client.ts's own comment for why).
 */
export const auth = buildAuth(db, env);

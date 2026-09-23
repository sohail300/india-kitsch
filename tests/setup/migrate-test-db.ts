/**
 * Applies every migration in ./drizzle to TEST_DATABASE_URL (the local/CI
 * Postgres from compose.yaml — never Supabase, docs/09 §20). Drizzle's
 * migrate() tracks applied migrations in its own table, so this is safe to
 * call from a test's beforeAll on every run, not just the first.
 *
 * Also runnable standalone: `npx tsx tests/setup/migrate-test-db.ts`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function migrateTestDb(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — see .env.example (run `podman compose up -d` / `docker compose up -d` first).",
    );
  }
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrateTestDb()
    .then(() => console.log("Test database migrated."))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

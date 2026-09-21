import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a standalone CLI, not the Next.js app, so it doesn't get
// Next's automatic .env.local loading — load it explicitly here instead.
// DATABASE_URL also isn't validated through src/server/lib/env.ts for the
// same reason (this file runs outside the Next.js process entirely).
config({ path: ".env.local" });

// The SESSION pooler, not the transaction pooler the app uses at runtime —
// migrations run outside a request and don't need `prepare: false`'s
// tradeoffs, and Supabase's own guidance is to run schema changes through
// the session pooler. See docs/01 §0 point 7 and docs/08 §18.
const databaseUrl = process.env.DATABASE_URL_SESSION;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_SESSION is not set — copy .env.example to .env.local and fill it in.",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Only these two schemas are ours to manage — see docs/03 §4 and docs/04 §14.
  schemaFilter: ["app", "keepalive"],
  dbCredentials: {
    url: databaseUrl,
  },
});

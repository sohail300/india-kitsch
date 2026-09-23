/**
 * Creates an admin user, using Better Auth's own signup flow so password
 * hashing goes through the same code path as a real user — never insert
 * a user row by hand. See docs/04 §5: "No public admin signup. Admins
 * are created by scripts/create-admin.ts or promoted directly in the DB
 * by the owner."
 *
 * Run with:
 *   npx tsx scripts/create-admin.ts --email=owner@example.com --password=... --name="Owner Name"
 *
 * The password is a CLI arg for simplicity — acceptable for a one-off
 * bootstrap script run locally, but clear your shell history afterward
 * if that matters on a shared machine.
 *
 * Builds its own connection + auth instance rather than importing
 * server/auth/auth.ts directly — same reasoning as db/seed.ts:
 * server-only breaks under plain tsx (see db/client.ts's comment).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildAuth } from "../src/server/auth/config";
import * as schema from "../src/server/db/schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = arg("email");
  const password = arg("password");
  const name = arg("name");
  if (!email || !password || !name) {
    console.error('Usage: npx tsx scripts/create-admin.ts --email=... --password=... --name="..."');
    process.exit(1);
  }

  const client = postgres(requireEnv("DATABASE_URL"), { prepare: false });
  const db = drizzle(client, { schema });
  const auth = buildAuth(db, {
    BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
    BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    TURNSTILE_SECRET: process.env.TURNSTILE_SECRET,
  });

  try {
    console.log(`→ Signing up ${email} via Better Auth...`);
    await auth.api.signUpEmail({ body: { email, password, name } });
    console.log("  ✓ user created");

    console.log("→ Promoting to admin + marking email verified...");
    const result = await db
      .update(schema.user)
      .set({ role: "admin", emailVerified: true })
      .where(eq(schema.user.email, email))
      .returning({ id: schema.user.id, email: schema.user.email, role: schema.user.role });

    if (result.length === 0)
      throw new Error("Signup appeared to succeed but no user row was found");
    console.log(`  ✓ ${result[0].email} is now role=${result[0].role}`);
    console.log(
      "\nDone. Enable 2FA on this account before it's used in production (docs/04 §5) — not automated here yet.",
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("create-admin failed:", error);
  process.exit(1);
});

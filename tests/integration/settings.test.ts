/**
 * Real integration test — local/CI Postgres 16 (compose.yaml), never
 * Supabase (docs/09 §20).
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import {
  PLACEHOLDER_SHIPPING_SETTINGS,
  SHIPPING_SETTINGS_KEY,
} from "@/server/modules/settings/schemas";
import { getShippingSettings } from "@/server/modules/settings/queries";
import { migrateTestDb } from "../setup/migrate-test-db";

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — see .env.example (run `podman compose up -d` / `docker compose up -d` first).",
    );
  }
  return url;
}

const client = postgres(requireTestDatabaseUrl(), { max: 5 });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrateTestDb();
}, 60_000);

afterAll(async () => {
  await db.delete(schema.storeSettings).where(eq(schema.storeSettings.key, SHIPPING_SETTINGS_KEY));
  await client.end();
});

describe("getShippingSettings", () => {
  it("falls back to the documented placeholder when no row exists", async () => {
    const result = await getShippingSettings(db);
    expect(result).toEqual(PLACEHOLDER_SHIPPING_SETTINGS);
  });

  it("reads real values once an admin sets them", async () => {
    await db.insert(schema.storeSettings).values({
      key: SHIPPING_SETTINGS_KEY,
      value: { feePaise: 5000, freeThresholdPaise: 199900 },
    });

    const result = await getShippingSettings(db);
    expect(result).toEqual({ feePaise: 5000, freeThresholdPaise: 199900 });
  });
});

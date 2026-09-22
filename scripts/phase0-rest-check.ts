/**
 * One-off Phase 0 spike check — not part of the app. Proves the REST/Data
 * API side of the schema lockdown (docs/03 §4, docs/04 §14):
 *  1. keepalive.ping is readable via REST with just the anon key.
 *  2. The `app` schema is NOT in Supabase's exposed-schemas list (that
 *     setting lives in the Supabase dashboard, not in SQL — this only
 *     checks the effect of it).
 *
 * Run with: npx tsx scripts/phase0-rest-check.ts
 * Never prints the anon key itself, only response status/bodies.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not set in .env.local");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is not set in .env.local");

  const baseHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  console.log("→ Reading keepalive.ping via REST with the anon key (no profile header)...");
  const pingRes = await fetch(`${supabaseUrl}/rest/v1/ping?select=id,ok`, { headers: baseHeaders });
  console.log(`  status ${pingRes.status}`);
  console.log(`  body: ${await pingRes.text()}`);
  if (pingRes.status === 200) {
    console.log("  ✓ keep-alive ping works exactly as the cron Worker will call it");
  } else {
    console.log(
      "  ✗ this should be 200 — check Settings → API → Exposed schemas includes 'keepalive'",
    );
  }

  console.log("\n→ Trying to read the 'app' schema via REST (Accept-Profile: app)...");
  const appRes = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { ...baseHeaders, "Accept-Profile": "app" },
  });
  console.log(`  status ${appRes.status}`);
  console.log(`  body: ${await appRes.text()}`);
  if (appRes.status >= 400) {
    console.log("  ✓ 'app' is correctly NOT exposed to REST");
  } else {
    console.log(
      "  ✗ 'app' appears reachable over REST — remove it from Settings → API → Exposed schemas",
    );
  }
}

main().catch((error) => {
  console.error("Phase 0 REST check failed:", error);
  process.exit(1);
});

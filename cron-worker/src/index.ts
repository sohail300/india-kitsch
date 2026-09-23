/**
 * India Kitsch cron Worker — daily Supabase keep-alive ping + backup
 * freshness check. See docs/08-infrastructure-backups-ops.md §16, §18
 * and docs/03-database-and-inventory.md §4.
 *
 * Keep-alive: Supabase Free pauses a project after a week of no
 * activity; this hits the one-row `keepalive.ping` table over REST with
 * the anon key (the *only* table that schema exposes — see the
 * app/keepalive schema lockdown) so the project never goes quiet long
 * enough to pause.
 *
 * Freshness check: reads the `backups/` prefix of the same R2 bucket
 * scripts/backup-db.ts writes to (via a native R2 binding — no signing
 * needed, same Cloudflare account) and fails loudly if the newest object
 * is more than 14 hours old (12h cadence plus slack), which would mean
 * the backup job (.github/workflows/backup.yml) has been silently
 * failing. A separate weekly job (prune-backups.yml) enforces the
 * rolling retention policy — see scripts/lib/backup-retention.ts and
 * docs/08 §16 — so this Worker never needs to know about that.
 *
 * Two independent triggers (wrangler.jsonc's `triggers.crons`), told apart
 * in `scheduled()` by `event.cron`:
 *  - daily (`0 0 * * *`): keep-alive + backup freshness (below);
 *  - every 10 minutes (`*​/10 * * * *`, Phase 6): POSTs
 *    `${APP_URL}/api/cron/reconcile` with `Authorization: Bearer
 *    CRON_SECRET` — lost-webhook recovery and late-payment detection
 *    (docs/06 §9 step 7). The reconcile logic itself lives entirely in the
 *    Next app (`src/server/modules/payments/reconcile.ts`); this Worker
 *    only exists to invoke it on a schedule Vercel Hobby's own cron (daily
 *    at best) can't provide.
 *
 * Deliberately NOT included yet (each is a separate later addition, not
 * a rewrite of this file):
 *  - Emailing the owner on failure (docs §18) — logged to Workers Logs
 *    for now; wire up Resend once the app has a shared email sender
 *    (Phase 8), then replace the `console.error`s below with real emails.
 *  - Pinging a second (staging) Supabase project — only one project
 *    exists right now; add a second SUPABASE_URL/ANON_KEY pair (and loop
 *    over both) once staging is provisioned.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  BACKUPS: R2Bucket;
  APP_URL: string;
  CRON_SECRET: string;
}

async function pingSupabaseKeepAlive(env: Env): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/ping?select=id`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Keep-alive ping failed: ${res.status} ${body}`);
  }

  console.log("Keep-alive ping OK:", await res.text());
}

// 14h = 12h cadence plus slack for GitHub's scheduler running late.
const MAX_BACKUP_AGE_HOURS = 14;

async function checkBackupFreshness(env: Env): Promise<void> {
  const listing = await env.BACKUPS.list({ prefix: "backups/" });

  if (listing.objects.length === 0) {
    throw new Error("No backups found under backups/ at all — has the backup job ever run?");
  }

  const newest = listing.objects.reduce((a, b) => (a.uploaded > b.uploaded ? a : b));
  const ageHours = (Date.now() - newest.uploaded.getTime()) / (1000 * 60 * 60);

  if (ageHours > MAX_BACKUP_AGE_HOURS) {
    throw new Error(
      `Newest backup (${newest.key}) is ${ageHours.toFixed(1)}h old — expected < ${MAX_BACKUP_AGE_HOURS}h. The backup job may be failing.`,
    );
  }

  console.log(`Backup freshness OK: ${newest.key} is ${ageHours.toFixed(1)}h old`);
}

async function runDailyChecks(env: Env): Promise<void> {
  const results = await Promise.allSettled([pingSupabaseKeepAlive(env), checkBackupFreshness(env)]);
  const failures = results.filter((r) => r.status === "rejected");
  for (const failure of failures) {
    // TODO(Phase 8): email the owner instead of only logging.
    console.error(failure.reason);
  }
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} of ${results.length} daily check(s) failed — see logs above`,
    );
  }
}

/** POSTs the reconciler (docs/06 §9 step 7) — the actual logic all lives in the Next app; this is purely "wake it up on a schedule Vercel can't." */
async function runReconcile(env: Env): Promise<void> {
  const res = await fetch(`${env.APP_URL}/api/cron/reconcile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Reconcile call failed: ${res.status} ${body}`);
  }

  const result = await res.json();
  console.log("Reconcile OK:", JSON.stringify(result));
}

const RECONCILE_CRON = "*/10 * * * *";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === RECONCILE_CRON) {
      ctx.waitUntil(runReconcile(env));
    } else {
      ctx.waitUntil(runDailyChecks(env));
    }
  },

  // Manual trigger for testing — `wrangler dev` and hit this route, or
  // curl the deployed Worker's URL directly. Read-only and low-stakes,
  // so no auth on it.
  async fetch(_request: Request, env: Env) {
    try {
      await runDailyChecks(env);
      return new Response("ok\n");
    } catch (error) {
      console.error(error);
      return new Response(`error: ${(error as Error).message}\n`, { status: 500 });
    }
  },
};

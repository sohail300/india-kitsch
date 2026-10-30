/**
 * India Kitsch cron Worker - daily Supabase keep-alive ping + backup
 * freshness check. See docs/08-infrastructure-backups-ops.md §16, §18
 * and docs/03-database-and-inventory.md §4.
 *
 * Keep-alive: Supabase Free pauses a project after a week of no
 * activity; this hits the one-row `keepalive.ping` table over REST with
 * the anon key (the *only* table that schema exposes - see the
 * app/keepalive schema lockdown) so the project never goes quiet long
 * enough to pause.
 *
 * Freshness check: reads the `backups/` prefix of the same R2 bucket
 * scripts/backup-db.ts writes to (via a native R2 binding - no signing
 * needed, same Cloudflare account) and fails loudly if the newest object
 * is more than 14 hours old (12h cadence plus slack), which would mean
 * the backup job (.github/workflows/backup.yml) has been silently
 * failing. A separate weekly job (prune-backups.yml) enforces the
 * rolling retention policy - see scripts/lib/backup-retention.ts and
 * docs/08 §16 - so this Worker never needs to know about that.
 * Skipped unless BACKUP_FRESHNESS_CHECK is "on" (wrangler.jsonc): the
 * backup workflows are deliberately disabled until customer handover.
 *
 * Two independent triggers (wrangler.jsonc's `triggers.crons`), told apart
 * in `scheduled()` by `event.cron`:
 *  - daily (`0 0 * * *`): keep-alive + backup freshness (below);
 *  - every 10 minutes (`*​/10 * * * *`, Phase 6): POSTs
 *    `${APP_URL}/api/cron/reconcile` with `Authorization: Bearer
 *    CRON_SECRET` - lost-webhook recovery and late-payment detection
 *    (docs/06 §9 step 7). The reconcile logic itself lives entirely in the
 *    Next app (`src/server/modules/payments/reconcile.ts`); this Worker
 *    only exists to invoke it on a schedule Vercel Hobby's own cron (daily
 *    at best) can't provide.
 *
 * Deliberately NOT included yet (a separate later addition, not a rewrite
 * of this file):
 *  - Pinging a second (staging) Supabase project - only one project
 *    exists right now; add a second SUPABASE_URL/ANON_KEY pair (and loop
 *    over both) once staging is provisioned.
 *
 * Owner-emailing on failure (docs §18) was the other item on this list -
 * done: `sendOwnerAlertEmail` below is a small hand-written Resend REST
 * call, same shape as the Next app's `server/lib/resend.ts` (this Worker
 * is a separate Cloudflare deployable with its own package.json/runtime,
 * so it can't import that module directly - duplicating the ~15-line
 * request shape is simpler than sharing a package for one function).
 * Failures still throw after the email attempt either way, so Workers
 * Logs/`wrangler tail` stay the backstop if the email itself fails.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  BACKUPS: R2Bucket;
  /** "on" runs the backup freshness check; anything else skips it. */
  BACKUP_FRESHNESS_CHECK: string;
  APP_URL: string;
  CRON_SECRET: string;
  /** Same Resend account as the Next app (`RESEND_API_KEY`), a separate
   * secret here since this Worker can't read the app's env. */
  RESEND_API_KEY: string;
  /** Sender address - reuses the Next app's `SUPPORT_EMAIL_FROM` domain by
   * convention, not required to match exactly. */
  ALERT_EMAIL_FROM: string;
  /** Same real, owner-monitored inbox as the Next app's `CONTACT_INBOX_EMAIL`. */
  ALERT_EMAIL_TO: string;
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
  if (env.BACKUP_FRESHNESS_CHECK !== "on") {
    console.log("Backup freshness check skipped (BACKUP_FRESHNESS_CHECK is not on)");
    return;
  }

  const listing = await env.BACKUPS.list({ prefix: "backups/" });

  if (listing.objects.length === 0) {
    throw new Error("No backups found under backups/ at all - has the backup job ever run?");
  }

  const newest = listing.objects.reduce((a, b) => (a.uploaded > b.uploaded ? a : b));
  const ageHours = (Date.now() - newest.uploaded.getTime()) / (1000 * 60 * 60);

  if (ageHours > MAX_BACKUP_AGE_HOURS) {
    throw new Error(
      `Newest backup (${newest.key}) is ${ageHours.toFixed(1)}h old - expected < ${MAX_BACKUP_AGE_HOURS}h. The backup job may be failing.`,
    );
  }

  console.log(`Backup freshness OK: ${newest.key} is ${ageHours.toFixed(1)}h old`);
}

/** Same request shape as `server/lib/resend.ts` in the Next app - hand-
 * written rather than the Resend SDK, for one endpoint it's not worth the
 * dependency. Never throws: a failed alert email must not hide the
 * original failure that triggered it, which `runDailyChecks` still throws
 * regardless of whether this succeeds. */
async function sendOwnerAlertEmail(env: Env, failures: string[]): Promise<void> {
  const subject = `[India Kitsch] Daily cron check failed (${failures.length})`;
  const text = failures.map((f) => `- ${f}`).join("\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: env.ALERT_EMAIL_TO,
        subject,
        text,
        html: `<p>${failures.length} daily cron check(s) failed:</p><ul>${failures
          .map((f) => `<li>${f.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`)
          .join("")}</ul>`,
      }),
    });
    if (!response.ok) {
      console.error(
        "sendOwnerAlertEmail: Resend API error",
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.error("sendOwnerAlertEmail: request failed", error);
  }
}

async function runDailyChecks(env: Env): Promise<void> {
  const results = await Promise.allSettled([pingSupabaseKeepAlive(env), checkBackupFreshness(env)]);
  const failures = results.filter((r) => r.status === "rejected");
  for (const failure of failures) {
    console.error(failure.reason);
  }
  if (failures.length > 0) {
    await sendOwnerAlertEmail(
      env,
      failures.map((f) => String((f as PromiseRejectedResult).reason)),
    );
    throw new Error(
      `${failures.length} of ${results.length} daily check(s) failed - see logs above`,
    );
  }
}

/** POSTs the reconciler (docs/06 §9 step 7) - the actual logic all lives in the Next app; this is purely "wake it up on a schedule Vercel can't." */
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

  // Manual trigger for testing - `wrangler dev` and hit this route, or
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

/**
 * India Kitsch cron Worker — Phase 0 scope: the daily Supabase keep-alive
 * ping only. See docs/08-infrastructure-backups-ops.md §18 and
 * docs/03-database-and-inventory.md §4.
 *
 * Supabase Free pauses a project after a week of no activity; this hits
 * the one-row `keepalive.ping` table over REST with the anon key (the
 * *only* table that schema exposes — see the app/keepalive schema
 * lockdown) so the project never goes quiet long enough to pause.
 *
 * Deliberately NOT included yet (each is a separate later addition, not a
 * rewrite of this file):
 *  - The 10-minute payment reconciler (`POST /api/cron/reconcile`) —
 *    doesn't exist until Phase 4 builds orders/payments.
 *  - The backup-freshness check (docs §16) — no backup job exists yet.
 *  - Emailing the owner on failure (docs §18) — logged to Workers Logs
 *    for now; wire up Resend once the app has a shared email sender.
 *  - Pinging a second (staging) Supabase project — only one project
 *    exists right now; add a second SUPABASE_URL/ANON_KEY pair (and loop
 *    over both) once staging is provisioned.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
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

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pingSupabaseKeepAlive(env));
  },

  // Manual trigger for testing — `wrangler dev` and hit this route, or
  // curl the deployed Worker's URL directly. Read-only and low-stakes
  // (same ping the schedule runs), so no auth on it.
  async fetch(_request: Request, env: Env) {
    try {
      await pingSupabaseKeepAlive(env);
      return new Response("ok\n");
    } catch (error) {
      console.error(error);
      return new Response(`error: ${(error as Error).message}\n`, { status: 500 });
    }
  },
};

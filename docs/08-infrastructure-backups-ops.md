# Backups, Deployment, Secrets & Monitoring

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 16. Database backup & recovery strategy

**Supabase Free has no backups and no point-in-time recovery**, so our own backups are the _only_ safety net. Defence in depth, so production never depends on one machine _or one vendor account_:

| Layer                         | What                                                                                                                                                                                                    | Retention                                                  | Purpose                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Frequent logical dumps** | GitHub Actions cron **every 6 hours** → `pg_dump` (session-pooler connection) → **`age`-encrypted** file → private R2 bucket `ik-backups` **and** an off-Cloudflare copy (e.g. Backblaze B2 free 10 GB) | 4/day for 7 days, 1/day for 30 days, 1/month for 12 months | Main recovery point. Encrypted because it contains customer PII. The DB is small and always awake, so frequent dumps cost nothing. They also count as daily database activity. |
| **2. Pre-migration dump**     | The migration workflow (§18) takes an on-demand dump immediately before applying any migration                                                                                                          | Kept with the daily set                                    | Substitutes for point-in-time recovery for the riskiest event: a bad migration                                                                                                 |
| **3. Images**                 | weekly `rclone sync` R2 → B2; soft-delete grace period (§12)                                                                                                                                            | continuous                                                 | R2 has no object versioning                                                                                                                                                    |
| **4. Code and schema**        | GitHub (migrations committed); secrets inventory in a password manager                                                                                                                                  | n/a                                                        | Rebuild the environment from scratch                                                                                                                                           |
| **5. Razorpay**               | independent record of every payment                                                                                                                                                                     | n/a                                                        | Reconcile after any restore                                                                                                                                                    |

**Targets:** RPO ≤ 6 hours (data written since the last dump can be lost); RTO < 1 hour. Once real orders flow, the upgrade trigger in §0 (Supabase Pro daily backups, or Neon Launch history) exists precisely to shrink this.

**Freshness alarm:** GitHub scheduled workflows can be delayed or silently disabled, so the daily Cloudflare cron Worker (which has an R2 binding) checks that the newest object in `ik-backups` is less than 8 hours old and emails the owner if not. The dump job also records DB size (input to the 400 MB alert).

**Runbook** `docs/runbooks/restore.md`: (a) create a fresh Supabase project (or any Postgres, e.g. Neon), (b) decrypt the latest dump and `pg_restore` it, (c) update `DATABASE_URL` in Vercel and redeploy, (d) run the **Razorpay reconciliation script** comparing captured payments vs orders since the dump time and contact any customer whose paid order was lost. **Quarterly restore drill** into a scratch project or local Postgres.

## 18. Production deployment architecture

- **Environments** (Vercel Hobby has Preview + Production only; custom environments are a Pro feature _(verify)_):
  - `local`: Docker Postgres, Razorpay test keys.
  - `staging`: the `staging` git branch → a stable Preview deployment aliased to `staging.<domain>` _(verify branch-domain assignment on Hobby)_. Env vars scoped to Preview: the **second free Supabase project**, Razorpay **test** keys, `noindex`, Vercel deployment protection on.
  - `production`: `main` → Production. The production Supabase project, Razorpay **live** keys.
  - These two Supabase projects use both free slots.
- **Pipeline:** PR → CI (lint, typecheck, unit, integration against a Postgres service container, `next build`, Playwright) → merge to `main` → Vercel builds. **Migrations run first:** a GitHub Actions job takes a **pre-migration dump** (§16), then applies `drizzle-kit migrate` to the target database via the **session pooler** _before_ the new code is promoted. Migrations are backward-compatible (add first, remove later) so the still-running old version never breaks.
- **Domain/edge:** Cloudflare DNS with the app hostname **DNS-only** (grey cloud) pointing at Vercel, since Vercel provides its own CDN and TLS and double-proxying can cause redirect/cert issues _(verify against Vercel's Cloudflare guidance)_; `www`→apex redirect. `img.<domain>` → R2 public bucket domain, **proxied** (this is where Cloudflare's CDN is used). Turnstile site; Resend domain with SPF/DKIM/DMARC.
- **Scheduled jobs (Vercel Hobby cron is daily at best, so a tiny Cloudflare cron Worker in `cron-worker/`, Free plan):**
  - **Every 10 minutes:** `POST /api/cron/reconcile` with `Authorization: Bearer CRON_SECRET` (lost-webhook recovery, §9 step 7). Supabase Free stays awake and has no compute meter, so frequency is no longer constrained by the database.
  - **Daily:** the **keep-alive** for production and staging: `GET {SUPABASE_URL}/rest/v1/ping?select=id` with the anon key, hitting only the one-row `keepalive` table (§4, §14); plus the backup-freshness check (§16). A failed ping emails the owner _before_ the one-week pause.
  - A daily Vercel cron (`vercel.json`) hits `/api/cron/sweep` (orphan-image sweep, webhook-event pruning) as a backup path.
  - All cron endpoints are idempotent and reject requests without the bearer secret.
- **Connections:** the app uses the **transaction pooler** (`prepare: false`); migrations and dumps use the **session pooler** because CI runners are IPv4-only and Supabase direct connections are IPv6 _(verify)_.
- **Razorpay activation (start early; KYC takes days):** business docs/GSTIN/bank account, live keys, webhook URL + events (`payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`), auto-capture on. Razorpay requires live pages: Terms, Privacy, **Refund/Cancellation**, **Shipping policy**, Contact.
- **Region — decided: Mumbai.** The Supabase project is in the Mumbai region; the Vercel function region should be set to match (`bom1`).
- **Plan gate:** before public launch, the owner confirms the Vercel plan decision (§0, §29 #1).

## 19. Environment variables & secrets strategy

| Variable                                                                                                              | Kind                                          | Where set                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL` (Supabase **transaction pooler**)                                                                      | secret                                        | Vercel env (per environment); `.env.local` locally (Docker Postgres)                 |
| `DATABASE_URL_SESSION` (**session pooler**, migrations and dumps)                                                     | CI/secret                                     | GitHub Actions secrets; never given to runtime code                                  |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`                                                                                   | config (the anon key is public by design)     | **Cloudflare cron Worker only**, for the keep-alive ping; not needed by the Next app |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                   | secret                                        | Vercel env (per environment; separate Google redirect URIs for local/staging/prod)   |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`                                                                      | secret                                        | Vercel env; **test values in Preview, live values in Production only**               |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_IMAGE_BASE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public                                        | Vercel env                                                                           |
| `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SECRET`                                                                    | secret                                        | Vercel env                                                                           |
| `CONTACT_INBOX_EMAIL` (§29 #13)                                                                                       | secret-ish (not a credential, but not public) | Vercel env; placeholder until the real inbox is decided                              |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`                                              | secret (token scoped to that bucket)          | Vercel env                                                                           |
| `CRON_SECRET`                                                                                                         | secret                                        | Vercel env + Cloudflare cron Worker secret                                           |
| `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`                                                                                     | secret                                        | Vercel env / CI                                                                      |
| `B2_*`, `BACKUP_AGE_PUBLIC_KEY`                                                                                       | CI-only                                       | GitHub Actions secrets (the _private_ age key stays offline in a password manager)   |

Rules: never `NEXT_PUBLIC_` a secret; **never create or store the Supabase `service_role` key** (it bypasses RLS, and we don't use Supabase's client SDKs); `.env.local` gitignored, `.env.example` committed; `env.ts` validates on boot; rotate on any suspected leak; keep a secrets inventory (what/where/who/rotation) in a password manager.

## 21. Monitoring & logging

- **Logs:** structured JSON logger with request id, route, user id (not email), duration; never log secrets, card/UPI data or full payloads. Vercel Hobby runtime-log retention is short _(verify)_, so **don't rely on it**: errors go to Sentry, and business-critical events are also written to an `audit_log`/events table.
- **Errors:** Sentry free tier (official Next.js SDK).
- **Uptime:** an external monitor (Better Stack / UptimeRobot free) hits `/api/health` (app liveness, no DB) every few minutes, and `/api/health/deep` (`SELECT 1` through the pooler) every ~5 minutes; the database is always awake on Supabase Free, so this costs nothing.
- **Business alerts (email to owner):** webhook signature failures, payment amount mismatch, paid-at-Razorpay-but-order-cancelled, reconciler discrepancies, confirmation-email failures, **backup job stale (> 8 h)**, **keep-alive ping failed**, low stock, **DB size > 400 MB**, Vercel usage nearing Hobby allowances (checked from dashboards weekly until automated). Supabase also emails before pausing a project; those emails must reach the owner.
- **Analytics:** Cloudflare Web Analytics; Razorpay dashboard for payment health.

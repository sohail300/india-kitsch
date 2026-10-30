# Next Steps: From Docs to Phase 0

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## Context

The architecture and implementation plan is finished across `docs/01`–`docs/11` (start at [README.md](./README.md)). Final stack: **Next.js 16 on Vercel Hobby + Supabase Postgres (Free, used purely as plain Postgres) + Cloudflare R2/DNS/cron Worker + Drizzle + Better Auth + Razorpay**, Ubuntu as the dev OS, a 5-minute payment hold, hosting cost ₹0. No application code exists yet. This file is the "what happens next" checklist; the design itself lives in the other files.

## Doc gap closed in Phase 6

~~`docs/06-checkout-payments-orders.md` currently only re-reserves stock / refunds a **late payment**... inside the **10-minute reconciler**...~~ Resolved: `payments/settle.ts`'s `settleCapturedPayment` is shared by the webhook handler and the reconciler, so a late payer is reinstated or refunded the moment the webhook arrives — the reconciler is now purely the backstop for a lost webhook, not the primary path. See docs/06's "Implementation notes (Phase 6)" section and `tests/integration/payments.test.ts`'s "reinstates/auto-refunds a late payment directly" cases.

## GitHub Actions secrets — done except `B2_*`

`.github/workflows/backup.yml` and `prune-backups.yml` (docs/08 §16) needed these added to the repo's **Settings → Secrets and variables → Actions** before they could run at all. **Resolved:** all secrets/variables below are added. The dedicated `ik-backups` R2 bucket has also been created — `scripts/backup-db.ts` still needs updating to actually use its own scoped credentials instead of the shared `R2_BUCKET` (images bucket), see the file's own TODO comment and docs/08 §16.

**Secrets** (Secrets tab):

| Name                   | Value / where to get it                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL_SESSION` | Same value as in `.env.local` — Supabase's **session pooler** connection string (Project Settings → Database) |
| `R2_ACCOUNT_ID`        | Same as `.env.local`                                                                                          |
| `R2_ACCESS_KEY_ID`     | Same as `.env.local`                                                                                          |
| `R2_SECRET_ACCESS_KEY` | Same as `.env.local`                                                                                          |
| `R2_BUCKET`            | Same as `.env.local`                                                                                          |
| `B2_ENDPOINT`          | From the Backblaze B2 bucket — created and verified. **All four `B2_*` still to add, at customer handover**   |
| `B2_BUCKET`            | From that same B2 bucket                                                                                      |
| `B2_ACCESS_KEY_ID`     | From a B2 application key                                                                                     |
| `B2_SECRET_ACCESS_KEY` | From that same application key                                                                                |

**Variables**, not secrets (Variables tab — it's genuinely not sensitive, safe to be visible in plain text):

| Name                    | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `BACKUP_AGE_PUBLIC_KEY` | The public half of the age keypair — already in `.env.local`/`.env.example` |

All of the above are now added — both workflows can run on schedule.

## Cron Worker secrets needed (blocks the owner-alert email from firing)

`cron-worker/src/index.ts`'s `sendOwnerAlertEmail` (docs/08 §18) is written and its Resend request shape verified against the real API from outside the Worker runtime — but the _deployed_ Worker won't actually have anything to send with until these are set, since it's a separate Cloudflare deployable with its own env, not the Next app's. Add via (from `cron-worker/`):

```
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ALERT_EMAIL_FROM
npx wrangler secret put ALERT_EMAIL_TO
```

| Name               | Value / where to get it                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`   | Same value as the Next app's `RESEND_API_KEY` in `.env.local` — same Resend account, a separate secret here only because this Worker can't read the app's env |
| `ALERT_EMAIL_FROM` | A sender address on a domain Resend has verified for you — same convention as the Next app's `SUPPORT_EMAIL_FROM`, doesn't need to match it exactly           |
| `ALERT_EMAIL_TO`   | Same value as the Next app's `CONTACT_INBOX_EMAIL` — the real, owner-monitored inbox                                                                          |

Until these exist, a daily-check failure still throws and still logs to Workers Logs/`wrangler tail` (unchanged from before) — it just can't email you about it yet. See `cron-worker/.dev.vars.example` for the equivalent local-dev vars.

## `ik-backups` bucket — one open question before `scripts/backup-db.ts` can be updated

The dedicated `ik-backups` R2 bucket exists (Cloudflare), but the script still uploads to the shared `R2_BUCKET` (images bucket) — its own TODO comment explains why (docs/08 §16). To close this out, I need one of:

- A new scoped R2 API token (access key + secret) limited to just `ik-backups`, so a leaked backup-job credential can't also touch product images — the point of splitting the bucket in the first place; or
- Your OK to point the existing `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` at the new bucket name as an interim step, accepting that they'd still be scoped to both buckets until a proper split happens later.

## Owner/user prerequisites (long lead time — start whenever convenient, no code blocked on these)

- Owner-created, owner-owned accounts with 2FA: GitHub, Vercel, Supabase (2 projects: production, staging), Cloudflare (DNS + R2), Razorpay (**start KYC now** — longest lead time of anything here), Resend, Sentry, Backblaze B2. Developer gets **invited access** (team member / scoped API token) on each, never a shared login — see `docs/11-risks-scope-decisions.md` §27/§29 #2.
- The two launch-blocking TBDs in §29: **#6 shipping** (fee, free-shipping threshold, delivery ETA, coverage) and **#7 return/refund policy** (window, who pays return shipping, refund vs exchange-only) — Razorpay won't activate live payments without live Shipping and Refund/Cancellation pages built from these.
- Brand assets (§29 #4) — needed before Phase 10 (public storefront UI) starts, not before the backend phases.

## Phase 0: foundations and spikes (~3 days; exit criteria in `docs/10-roadmap.md`)

1. Move development to Ubuntu (native or WSL2, repo inside the Linux filesystem, not `/mnt/*`); Node 22 LTS, Docker, GitHub CLI.
2. Install dependencies (Drizzle, Zod, Better Auth, etc.); add `env.ts`, logger, `money.ts`; CI workflow; ESLint/Prettier.
3. Deploy hello-world to Vercel Hobby, region matched to the Supabase region (Mumbai — §29 #11; confirm the Vercel project's function region is actually set to `bom1`, not left on a default).
4. Supabase: create the private `app` schema and the one-row `keepalive` schema, enable RLS deny-all on `app`, confirm the anon key cannot read any `app` table while the `keepalive` REST ping succeeds (§4, §14).
5. Drizzle + Supabase transaction pooler: run a real `db.transaction` with `prepare: false`; run migrations and `pg_dump` from CI through the session pooler (confirms IPv4 access).
6. R2: browser → presigned PUT upload, then the commit/verify step (§12).
7. Cloudflare cron Worker → `/api/cron/reconcile` (10 min) and the daily keep-alive + backup-freshness check (§18).
8. Confirm Cache Components on a sample product page (read `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` first, per `AGENTS.md`), else fall back to classic ISR.
9. Measure Vercel Active CPU of a dynamic route and of password hashing; confirm Better Auth's cookie-cache options.
10. Record findings in `docs/`, resolving §29 #15 (region) and #16 (Data API lockdown vs. disable) with evidence, and adjust the plan anywhere a spike disproves an assumption.

## Then

Phases 1–14 as written in `docs/10-roadmap.md`: **all backend first** (schema → backups/monitoring → auth → catalog/inventory → cart/pricing/coupons → checkout/payments → admin logic/media → email → hardening), **then all frontend** (public storefront UI → admin panel UI → content/polish), **then launch prep → launch**. Roughly 7–9 weeks total — same scope as before, resequenced per the owner's call to finish the backend before any UI work starts.

## Verification

Phase 0 is done only when every exit criterion in `docs/10-roadmap.md` ("Verification" section) for Phase 0 passes with evidence (test output, screenshots), not assumptions.

## Customer handover — paused until delivery

The owner paused these on 2026-10-30, to be turned on when the site is delivered to the customer. They are deliberate, not broken: don't re-enable them early.

**Backups.** Nothing is being backed up right now. The pipeline itself works: run `41076739023` dumped, encrypted and uploaded to R2 (`backups/india-kitsch-2026-10-30T15-01-31-539Z-scheduled.dump.age`). At handover:

1. `gh workflow enable backup.yml` and `gh workflow enable prune-backups.yml`.
2. Add the four `B2_*` repo secrets (values are in `.env.local`). Until then the script logs a warning and skips the off-Cloudflare copy.
3. Set `BACKUP_FRESHNESS_CHECK` to `"on"` in `cron-worker/wrangler.jsonc` and deploy the Worker.
4. Run the backup workflow once and confirm the file appears in both R2 and B2.
5. Do a test restore from the encrypted dump. No restore has been tried yet.

**Cron Worker.** Live version `ad8960d5` (deployed 2026-10-30) has only `SUPABASE_URL` and `SUPABASE_ANON_KEY` as secrets. Keep-alive needs nothing more, but before launch:

- Set `CRON_SECRET` and a real `APP_URL`. Until then the 10-minute reconcile trigger fails on every run (visible only in Worker logs), and lost-webhook recovery doesn't work.
- Set `RESEND_API_KEY`, `ALERT_EMAIL_FROM` and `ALERT_EMAIL_TO` (see "Cron Worker secrets needed" above). Until then a failed daily check only reaches the Worker logs.

**Deploying the Worker:** always run `npx wrangler deploy` from inside `cron-worker/`. Run from the repo root, wrangler treats the project as a Next.js app and starts converting it to the OpenNext Cloudflare adapter, rewriting `package.json`, `package-lock.json`, `next.config.ts` and `.gitignore` and adding `wrangler.jsonc` and `open-next.config.ts`. This happened once on 2026-10-30 and was reverted. The site deploys to Vercel, not Cloudflare.

## Storefront UI — pending

The static storefront (`src/app/(storefront)/`, Sansevieria theme with placeholder content) is in place; these are deliberately not done yet:

- **Profile/account icon:** should open the login page when signed out and the customer's profile page when signed in. Currently inactive (header icon and the mobile menu's "My Account" row) — needs customer auth pages first (Phase 10).
- **Checkout:** the bag drawer's Checkout button is inactive until `/checkout` exists; the bag itself stores only `{variantId, qty}` in `localStorage` (`ikCart:v1`), per docs/05 §8, and should switch to `quoteCart` for prices once wired to the backend.
- **Placeholder content to replace:** India Kitsch logo (text wordmark for now), the Diwali hero photo (has Sansevieria's Hindi name baked in), the Hindi wordmark spelling, footer contact details, About/FAQ/policy copy, and all Sansevieria product/blog photos.
- **Reel videos:** posters only; the three MP4s need a home (R2 or `public/`, owner's call).

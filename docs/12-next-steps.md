# Next Steps: From Docs to Phase 0

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## Context

The architecture and implementation plan is finished across `docs/01`–`docs/11` (start at [README.md](./README.md)). Final stack: **Next.js 16 on Vercel Hobby + Supabase Postgres (Free, used purely as plain Postgres) + Cloudflare R2/DNS/cron Worker + Drizzle + Better Auth + Razorpay**, Ubuntu as the dev OS, a 5-minute payment hold, hosting cost ₹0. No application code exists yet. This file is the "what happens next" checklist; the design itself lives in the other files.

## One doc gap to close before Phase 6 code

`docs/06-checkout-payments-orders.md` currently only re-reserves stock / refunds a **late payment** (a customer who pays after their 5-minute hold expired) inside the **10-minute reconciler** (step 7). It should also run directly in the **webhook handler** (step 5), so a late payer isn't waiting up to 10 minutes for their order to confirm or their refund to start — the reconciler then becomes the backstop for a lost webhook, not the primary path. Update §9/§10 with this before implementing checkout in Phase 6 (checkout & payments backend).

## GitHub Actions secrets needed (blocks the backup pipeline right now)

`.github/workflows/backup.yml` and `prune-backups.yml` (docs/08 §16) are written but can't run until these exist in the repo's **Settings → Secrets and variables → Actions**. Add at **repo** scope (not environment-scoped — there's only one environment for these jobs).

**Secrets** (Secrets tab):

| Name                   | Value / where to get it                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL_SESSION` | Same value as in `.env.local` — Supabase's **session pooler** connection string (Project Settings → Database) |
| `R2_ACCOUNT_ID`        | Same as `.env.local`                                                                                          |
| `R2_ACCESS_KEY_ID`     | Same as `.env.local`                                                                                          |
| `R2_SECRET_ACCESS_KEY` | Same as `.env.local`                                                                                          |
| `R2_BUCKET`            | Same as `.env.local`                                                                                          |
| `B2_ENDPOINT`          | From the Backblaze B2 bucket you still need to create (see the prerequisites list below)                      |
| `B2_BUCKET`            | From that same B2 bucket                                                                                      |
| `B2_ACCESS_KEY_ID`     | From a B2 application key                                                                                     |
| `B2_SECRET_ACCESS_KEY` | From that same application key                                                                                |

**Variables**, not secrets (Variables tab — it's genuinely not sensitive, safe to be visible in plain text):

| Name                    | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `BACKUP_AGE_PUBLIC_KEY` | The public half of the age keypair — already in `.env.local`/`.env.example` |

Until these exist, both workflows will fail on every scheduled run (harmless — nothing partial happens, they just exit with a missing-env error) or can simply be left un-triggered until you're ready.

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

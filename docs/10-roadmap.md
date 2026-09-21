# Phases & Roadmap (empty repo to production)

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 22. Development phases / milestones

_(Estimates are rough, for one full-time developer.)_

| Phase                          | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                  | Est.           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **0 Foundations & spikes**     | Vercel + Supabase connected; Drizzle transaction works through the transaction pooler (`prepare: false`); private `app` schema + RLS + `keepalive` schema set up and REST ping verified (anon key cannot read app tables); R2 presigned upload works; Cache Components confirmed on a sample product page; cron Worker → protected endpoint and keep-alive work; Vercel Active-CPU baseline measured; CI; env validation | 3 d            |
| **1 Data & public catalog**    | schema + migrations + seed; home, shop, category, PDP, variants, size chart, search/filter, SEO basics                                                                                                                                                                                                                                                                                                                   | ~1 wk          |
| **2 Auth & accounts**          | Better Auth, email verify, Google, reset, profile, addresses, roles, admin bootstrap + 2FA                                                                                                                                                                                                                                                                                                                               | 4–5 d          |
| **3 Admin catalog**            | categories, products, variant matrix, image upload, inventory                                                                                                                                                                                                                                                                                                                                                            | 1–1.5 wk       |
| **4 Cart, checkout, payments** | cart + quote, coupons, `createOrder`, Razorpay, webhook, reconciler cron, emails, order history                                                                                                                                                                                                                                                                                                                          | ~1.5 wk        |
| **5 Admin operations**         | orders (state machine UI, tracking, refund), customers, coupons, dashboard, settings                                                                                                                                                                                                                                                                                                                                     | ~1 wk          |
| **6 Content & polish**         | About/Contact/FAQ/policies/size guide, a11y, perf, SEO, responsive QA                                                                                                                                                                                                                                                                                                                                                    | 4–5 d          |
| **7 Hardening & launch prep**  | security review, backups + restore drill, monitoring/alerts, concurrency/load tests, Razorpay KYC/live, staging UAT, launch checklist, plan decision (§29 #1)                                                                                                                                                                                                                                                            | ~1 wk          |
| **8 Launch + hypercare**       | go-live; watch payments/logs daily for 2 weeks                                                                                                                                                                                                                                                                                                                                                                           | 2 wk part-time |

Total ≈ **7–9 weeks** to launch-ready.

## 26. Step-by-step roadmap: empty repo → production

1. **Repo hygiene:** commit the current cleanup; set `main` as default; branch protection; `.gitignore` entries (`.env*.local`, `.vercel`); Prettier; `docs/` committed.
2. **Read the Next docs that apply** in `node_modules/next/dist/docs/` (caching, ISR, proxy, route handlers, mutating data, authentication, metadata, images, error handling).
3. **Accounts (owner-owned, 2FA on):** GitHub, Vercel (Hobby), Supabase (two free projects: production and staging; owner receives Supabase's pause-warning emails), Cloudflare (DNS, R2 buckets), Razorpay (start KYC), Resend, Sentry, Backblaze B2.
4. **Spike (Phase 0):** deploy hello-world to Vercel; connect Drizzle to Supabase and run a real `db.transaction` via the transaction pooler (compare `postgres-js` with `prepare: false` vs `pg`), and run migrations and `pg_dump` from CI via the session pooler (IPv4 check); create the `app` / `keepalive` schemas with RLS and prove the anon key can't read app tables; confirm from Supabase's docs (and, if possible, a test) that a REST ping counts as activity against the 1-week pause; presigned upload to R2 from the browser; cron Worker → `/api/cron/reconcile` and the daily keep-alive; confirm Cache Components on a sample PDP; measure password-hash CPU and one dynamic page's CPU; confirm Better Auth cookie-cache options.
5. **Foundation code:** Zod `env.ts`, logger, error types, `money.ts`, Drizzle client, CI workflow, migration workflow.
6. **Schema v1** (§4) + first migration + local seed; integration-test harness on Postgres.
7. **Public catalog** (home, shop, category, PDP, search, filters, size chart, SEO/sitemap) reading seeded data; responsive design pass (design direction chosen with the owner first; brand assets needed).
8. **Auth:** Better Auth + Drizzle; register/login/verify/reset/Google; session helpers (`requireUser`, `requireAdmin`); `create-admin` script; admin 2FA; Turnstile + rate limits.
9. **Account area:** profile, address book, order-history shell.
10. **Admin shell + catalog CRUD:** categories → products → variant matrix → **image upload to R2** → inventory adjustments; cache revalidation on save.
11. **Cart:** localStorage cart, `quoteCart`, cart drawer/page, price-change notices.
12. **Coupons module** (admin CRUD + validation service).
13. **Checkout core:** `pricing.ts`, address step, `createOrder` (Razorpay order → transactional reserve), idempotency; **write the concurrency and rollback integration tests now**.
14. **Razorpay completion:** client Checkout, `verifyPayment`, **webhook route**, `markOrderPaid`, refund wrapper; test-mode sandbox pass.
15. **Cron:** cron Worker (10-minute reconciler, daily keep-alive for prod + staging, backup-freshness check) + reconciler logic (lost webhook, late payment) + sweep; alerts.
16. **Emails:** verify/reset/order confirmation/shipped/cancelled/refunded (Resend, domain DNS).
17. **Admin orders:** state-machine UI, tracking entry, refund, notes, packing slip/invoice print view; customers; dashboard; settings.
18. **Content pages** (About, Contact with Turnstile, FAQ, Privacy, Terms, Returns/Refund, Shipping, Size guide); copy from the owner, legal review theirs.
19. **Polish and QA:** accessibility, Lighthouse/CWV budgets, cross-browser/device, empty/error/loading states, 404/500.
20. **Security pass:** CSP/headers, authz audit of every action/route, dependency audit, secrets audit (no live keys in Preview), webhook fuzz tests, upload abuse tests.
21. **Backups (Supabase Free has none):** GitHub Actions `pg_dump` every 6 hours → encrypted → R2 + B2; pre-migration dump in the migration workflow; freshness alarm; image sync; **perform a restore drill**; write runbooks.
22. **Monitoring:** Sentry, uptime (`/api/health` and `/api/health/deep`), business alerts (backup stale, keep-alive failed, DB size), Web Analytics, usage dashboards for Supabase and Vercel allowances.
23. **Staging UAT:** full purchase flows on Razorpay test mode with the owner; fix findings.
24. **Go-live prep:** Razorpay KYC + live keys/webhook, live policy pages, DNS, Resend domain verified, production Supabase migrated + seeded with the real catalogue, production env vars, **owner sign-off on the Vercel plan decision**, launch checklist signed off.
25. **Launch:** a small real ₹ test order (then refund), announce; monitor daily for two weeks; review Supabase/Vercel usage against limits and apply the upgrade triggers (§0).
26. **Post-launch backlog:** COD, shipping aggregator, returns workflow, reviews, wishlist, abandoned-cart emails (§28).

## Verification (how we know the plan's outcome is right)

Phase gates that must pass before moving on:

- **Phase 0 exit:** a real Drizzle transaction commits and rolls back correctly via Supabase's transaction pooler from a Vercel function; migrations and `pg_dump` run from CI; anon key cannot read any `app` table while the keep-alive ping succeeds; presigned R2 upload works from a browser; cron Worker successfully calls a protected endpoint; Cache Components confirmed (or classic ISR chosen) with evidence; CPU of dynamic routes measured.
- **Phase 4 exit:** the parallel-checkout test shows **no oversell**; webhook replay/tamper tests pass; Razorpay test-mode success, failure, closed-modal and refund flows verified end-to-end; the reconciler recovers a deliberately dropped webhook.
- **Phase 7 exit (launch checklist):** restore drill completed from an encrypted dump into a fresh Postgres, with the Razorpay reconciliation script run afterwards; backup-freshness and keep-alive alarms confirmed by triggering each once; authz audit clean (customer A cannot reach customer B's data, non-admin blocked from admin); CSP doesn't break Razorpay Checkout; Lighthouse budgets met on mobile; a live-mode ₹ test order placed and refunded; no live secrets in Preview; all alerts confirmed by triggering each once; Vercel/Supabase usage thresholds and upgrade triggers documented.

# Phases & Roadmap (empty repo to production)

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 22. Development phases / milestones

_(Estimates are rough, for one full-time developer. Total scope is unchanged from an earlier version of this plan that interleaved frontend and backend per feature — this is the same work, resequenced: **all backend first, proven working without any UI, then all UI built against a finished backend.** Every backend phase is verified the same way Phase 0 was — real scripts/curl/integration tests against the real Supabase project, not "it compiles.")_

### Part A — Backend (no UI)

| Phase                                 | Outcome                                                                                                                                                                                                                                                     | Est.  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **1 Full schema, migrations & seed**  | Every business table (§4: products, categories, variants, images, inventory, stock movements, addresses, coupons, orders, order items) plus Better Auth's own tables, all in `app`; local seed data; integration-test harness against a real Postgres       | 3–4 d |
| **2 Backups & monitoring wiring**     | GitHub Actions `pg_dump` every 12h → encrypted → R2 + B2, rolling retention pruned weekly; pre-migration dump; freshness alarm; Sentry; `/api/health` + `/api/health/deep`; Web Analytics — done early since it's pure infra and protects data from here on | 1–2 d |
| **3 Auth backend**                    | Better Auth + Drizzle adapter; session/DAL helpers (`requireUser`, `requireAdmin`); email verification + Google + reset logic; `create-admin` script; admin 2FA; Turnstile + rate limits — all curl/script-testable, no login page yet                      | 3 d   |
| **4 Catalog & inventory backend**     | Product/category queries and services; search/filter logic; cache-tag design; stock reservation with the conditional-`UPDATE` pattern (§11), proven with a concurrency test                                                                                 | 3–4 d |
| **5 Cart, pricing & coupons backend** | `pricing.ts` (GST-inclusive split, shipping threshold, rounding); `quoteCart`; coupon validation service with the conditional-`UPDATE` usage-limit pattern                                                                                                  | 2–3 d |
| **6 Checkout & payments backend**     | `createOrder` (Razorpay order → transactional reserve, idempotency); `verifyPayment`; **webhook route**; `markOrderPaid`; refunds; reconciler logic wired into the existing cron Worker as its second trigger                                               | 5–6 d |
| **7 Admin backend & media**           | Every admin service function (products, categories, inventory, orders, customers, coupons, settings) as callable logic; `/api/admin/uploads/sign` + `/commit` route handlers on the real R2 flow proven in Phase 0                                          | 4–5 d |
| **8 Email/notifications backend**     | Resend wiring; transactional templates (verify, reset, order confirmation, shipped, cancelled, refunded) as content, not visual design; domain DNS (SPF/DKIM/DMARC)                                                                                         | 1–2 d |
| **9 Backend hardening**               | Concurrency/load tests on checkout; authz audit of every action/route via direct calls; webhook replay/tamper/fuzz tests; dependency + secrets audit; CSP/security headers                                                                                  | 3–4 d |

### Part B — Frontend (built against the finished, hardened backend)

| Phase                         | Outcome                                                                                                                                      | Est.  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **10 Public storefront UI**   | Design direction proposed and agreed first; home, shop, category, PDP, variants, size chart, cart, checkout, account, auth pages, SEO basics | 5–6 d |
| **11 Admin panel UI**         | Dashboard, product/category/inventory/order/customer/coupon/settings screens, wired to the Phase 7 service functions                         | 4–5 d |
| **12 Content pages & polish** | About/Contact/FAQ/policies/size guide; a11y; Lighthouse/CWV budgets; responsive QA; empty/error/loading states                               | 4–5 d |

### Part C — Launch

| Phase                     | Outcome                                                                                                                                        | Est.           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **13 Launch prep**        | Razorpay live KYC/keys, staging UAT (full purchase flows with the owner), restore drill, launch checklist, plan decision (§29 #1) re-confirmed | ~1 wk          |
| **14 Launch + hypercare** | Go-live; watch payments/logs daily for 2 weeks                                                                                                 | 2 wk part-time |

Total ≈ **7–9 weeks** to launch-ready — same total scope as before, just resequenced.

## 26. Step-by-step roadmap: empty repo → production

**Done (Phase 0):**

1. **Repo hygiene:** commit the current cleanup; set `main` as default; branch protection; `.gitignore` entries; Prettier; `docs/` committed. ✅
2. **Read the Next docs that apply** in `node_modules/next/dist/docs/` before each feature. ✅ (ongoing — re-read the relevant guide before each new Next.js feature, not just once)
3. **Accounts (owner-owned, 2FA on):** GitHub, Vercel, Supabase, Cloudflare, Razorpay (KYC started), Resend, Sentry, Backblaze B2. ✅ (Cloudflare/Vercel currently under the developer's own account pending the owner-ownership migration — see docs/11 §27)
4. **Spike (Phase 0):** Vercel hello-world deployed; Drizzle transaction proven through the transaction pooler; `app`/`keepalive` schema lockdown migrated and RLS-verified; R2 presigned upload proven; cron Worker deployed and proven (keep-alive only so far); Cache Components confirmed with real evidence. ✅

**Part A — Backend, in order:**

5. **Foundation code:** Zod `env.ts`, logger, `money.ts`, Drizzle client, CI, migration workflow. ✅ (Phase 0 scaffolding already covers this — `errors.ts`, `tax.ts`, `ids.ts`, `rate-limit.ts` from the `server/lib/` layout in docs/02 still to come as the phases that need them arrive)
6. **Schema v1** (§4): every business table + Better Auth's tables, inside `app`; first real migration; local seed data; integration-test harness on Postgres. ✅ 24 tables migrated and verified against the real Supabase project (7 CHECK constraints, the `order_number_seq` sequence, all FKs); seed script run and verified (4 categories, 20 products, 192 variants, zero duplicate SKUs). Integration-test harness (real concurrency/rollback tests) still to come — deferred to step 9, where it's actually needed.
7. **Backups & monitoring wiring:** `pg_dump` every 12h → encrypted → R2 + B2, rolling retention; freshness alarm; Sentry; health endpoints. ✅ mostly — `/api/health` and `/api/health/deep` built and verified live (both confirmed dynamic, not prerendered); `scripts/backup-db.ts` written, with the encrypt→R2-upload→download→decrypt round-trip verified against real R2 (only `pg_dump` itself is unverified — not available on this Windows dev machine, only runs on Ubuntu/CI); `scripts/prune-backups.ts` + its pure selection logic (`scripts/lib/backup-retention.ts`) written and verified — 11 unit tests covering every tier and boundary, plus the real batch-delete call proven against R2; `.github/workflows/backup.yml` (every 12h) and `prune-backups.yml` (weekly) written (need GitHub secrets added before either can actually run); cron Worker's freshness threshold updated to match (14h) and redeployed, verified both failure and success paths against the real bucket. **Still open:** GitHub Actions secrets not yet added (blocks both workflows from running at all), Backblaze B2 account not yet created (blocks the off-Cloudflare copy — the script skips it and warns rather than failing), dedicated `ik-backups` bucket not yet split out from the images bucket (TODO before production, see scripts/backup-db.ts), Sentry not yet set up, Web Analytics deferred to Phase 10 (no real domain/traffic yet).
8. **Auth backend:** Better Auth + Drizzle; session helpers; `create-admin` script; admin 2FA; Turnstile + rate limits — verified via curl/API calls, no pages yet.
9. **Catalog & inventory backend:** product/category services and queries; search/filter logic; cache-tag design; **write the stock-reservation concurrency test now** (last-unit race, per docs/09 §20).
10. **Cart, pricing & coupons backend:** `pricing.ts`; `quoteCart`; coupon validation service.
11. **Checkout & payments backend:** `createOrder`, Razorpay integration, **webhook route**, `markOrderPaid`, refunds; wire the reconciler into the existing cron Worker as its second trigger; **write the rollback and idempotency integration tests now**.
12. **Admin backend & media:** every admin service function; R2 upload route handlers (sign/commit) on the proven Phase 0 flow.
13. **Email/notifications backend:** Resend wiring; transactional email content; domain DNS.
14. **Backend hardening:** concurrency/load tests; full authz audit via direct API/action calls (no UI needed to prove a customer can't reach another customer's data); webhook fuzz tests; dependency + secrets audit; CSP/security headers.

**Part B — Frontend, only after Part A is done and hardened:**

15. **Design direction:** proposed and agreed with the owner before any page markup.
16. **Public storefront UI:** home, shop, category, PDP, search/filters, size chart, cart, checkout, account area, auth pages (login/register/verify/reset), SEO/sitemap — all built against the already-tested backend from Part A.
17. **Admin panel UI:** dashboard, product/category/inventory/order/customer/coupon/settings screens, wired to the Phase 7/12 service functions.
18. **Content pages** (About, Contact with Turnstile, FAQ, Privacy, Terms, Returns/Refund, Shipping, Size guide); copy from the owner, legal review theirs.
19. **Polish and QA:** accessibility, Lighthouse/CWV budgets, cross-browser/device, empty/error/loading states, 404/500.

**Part C — Launch:**

20. **Staging UAT:** full purchase flows on Razorpay test mode with the owner; fix findings.
21. **Go-live prep:** Razorpay KYC + live keys/webhook, live policy pages, DNS, Resend domain verified, production Supabase migrated + seeded with the real catalogue, production env vars, **owner sign-off on the Vercel plan decision (§29 #1)**, launch checklist signed off.
22. **Launch:** a small real ₹ test order (then refund), announce; monitor daily for two weeks; review Supabase/Vercel usage against limits and apply the upgrade triggers (§0).
23. **Post-launch backlog:** COD, shipping aggregator, returns workflow, reviews, wishlist, abandoned-cart emails (§28).

## Verification (how we know the plan's outcome is right)

Phase gates that must pass before moving on:

- **Phase 0 exit — done:** a real Drizzle transaction commits and rolls back correctly via Supabase's transaction pooler from a Vercel function; migrations and `pg_dump` run from CI; anon key cannot read any `app` table while the keep-alive ping succeeds; presigned R2 upload works from a browser; cron Worker successfully calls a protected endpoint; **Cache Components confirmed** (`cacheComponents: true` enabled; `next build` labelled a spike route `◐ Partial Prerender` with the expected `cacheLife` window, and repeated requests showed the cached part unchanged while the `connection()`-gated part changed every time — see docs/05 §7); CPU of dynamic routes measured (deferred — Vercel dashboard numbers, once there's enough built to be worth measuring, per the owner's call).
- **Phase 6 exit (checkout/payments backend):** the parallel-checkout test shows **no oversell**; webhook replay/tamper tests pass; Razorpay test-mode success, failure, closed-modal and refund flows verified end-to-end (via script/API calls, no UI needed yet); the reconciler recovers a deliberately dropped webhook.
- **Phase 9 exit (backend hardening — the gate before any UI work starts):** every service function and route handler has been exercised directly (script/curl/integration test) proving authz (customer A cannot reach customer B's data via a direct call; non-admin blocked from every admin action), no oversell under concurrency, webhook idempotency, and CSP/security headers are in place.
- **Phase 13 exit (launch checklist):** restore drill completed from an encrypted dump into a fresh Postgres, with the Razorpay reconciliation script run afterwards; backup-freshness and keep-alive alarms confirmed by triggering each once; CSP doesn't break Razorpay Checkout; Lighthouse budgets met on mobile; a live-mode ₹ test order placed and refunded; no live secrets in Preview; Vercel/Supabase usage thresholds and upgrade triggers documented.

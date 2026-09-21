# Testing Strategy

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 20. Testing strategy

Focus test effort where money and inventory move, not on vanity coverage.

- **Unit (Vitest):** `money`, `pricing` (rounding, GST-inclusive extraction, coupon allocation, shipping threshold), coupon validation, the order **state machine** (every legal/illegal transition), Razorpay signature verification (good/bad/tampered/wrong-length), env parsing.
- **Integration (real Postgres 16):** locally via `docker compose`, in CI via a GitHub Actions Postgres service container; migrations applied to a fresh DB each run. Never against the Supabase projects.
  - `createOrder` happy path.
  - **Concurrency: N parallel `createOrder` calls for the last unit ⇒ exactly one succeeds, `reserved <= on_hand` always, no deadlocks with overlapping multi-line carts.**
  - Coupon-limit races; transaction rollback on partial failure.
  - `markOrderPaid` idempotency (called 3× ⇒ one sale movement).
  - Webhook: duplicate event, out-of-order events, invalid signature ⇒ 400, amount mismatch ⇒ rejected.
  - Reconciler: lost webhook, late payment, expiry.
  - Authz: customer cannot read another user's order; non-admin blocked from every admin action; cron endpoints reject requests without the bearer secret.
  - Upload commit: wrong magic bytes / oversize rejected.
- **Razorpay:** HTTP layer mocked with recorded fixtures in CI; a **manual/sandbox pass in test mode** (success, failure, UPI, closed modal, refund) before each release.
- **E2E (Playwright):** browse → filter → PDP → add to cart → login gate → address → coupon → pay (Razorpay test card/UPI) → confirmation → order history. Admin: create a product with variants and images, receive an order, mark processing → shipped with tracking, refund. Mobile viewport included.
- **Non-functional:** axe accessibility on key pages, Lighthouse CI budgets, a modest `k6`/`autocannon` run against staging on the checkout path (watch pooler connections and the Micro instance's CPU while doing it). Also a staging smoke test that runs a real transaction through the **transaction pooler** with prepared statements off, and that the anon key cannot read any `app` table.
- **CI:** GitHub Actions on every PR: lint, typecheck, unit, integration, build; e2e on the staging preview.

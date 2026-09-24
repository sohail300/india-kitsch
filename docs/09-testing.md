# Testing Strategy

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 20. Testing strategy

Focus test effort where money and inventory move, not on vanity coverage.

- **Unit (Vitest):** `money`, `pricing` (rounding, GST-inclusive extraction, coupon allocation, shipping threshold), coupon validation, the order **state machine** (every legal/illegal transition), Razorpay signature verification (good/bad/tampered/wrong-length), env parsing.
- **Integration (real Postgres 16):** locally via `docker compose`/`podman compose` (`compose.yaml`, `TEST_DATABASE_URL`), in CI via a GitHub Actions Postgres service container (`.github/workflows/ci.yml`); migrations applied via `tests/setup/migrate-test-db.ts`. Catalog and inventory tests (Phase 4) take this rule literally — an injectable `dbHandle` argument on every query/service function, defaulting to the real `db` singleton, lets tests point the exact same code at `TEST_DATABASE_URL` instead. **One deliberate exception:** `tests/integration/session.test.ts` (Phase 3, auth) imports the app's `auth`/`db` singletons directly rather than taking an injectable handle, so it runs against whatever `DATABASE_URL` resolves to — the real Supabase project locally (this project's established "verify against real infrastructure" practice), but the same ephemeral CI Postgres container as everything else in CI, since CI overrides `DATABASE_URL` too. Revisit if that split ever causes a real discrepancy.
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

## Implementation notes (Phase 9 — backend hardening, verified against real infra per this doc's own discipline)

- **`tests/integration/route-authz.test.ts` is the same deliberate real-Supabase exception §20 already documents for `session.test.ts`, for the same reason:** these routes' service calls (`signProductImageUpload`, `commitProductImageUpload`) are invoked by the route handlers with no `dbHandle` override, so they resolve to the app's real `db` singleton regardless — testing them through the actual `POST` function only means something if the DB they hit is the real one Better Auth's session lookup also uses.
- **The webhook route (`app/api/webhooks/razorpay/route.ts`) has no dedicated route-level authz test, by design** — it does no business logic itself (docs/06 §9 step 5), just plumbs the raw body/headers to `handleRazorpayWebhook`, which is exhaustively covered directly (signature, idempotency, amount-mismatch, out-of-order).
- **The cron route's happy path (correct bearer secret) is deliberately not exercised in `route-authz.test.ts`** — `reconcileExpiredOrders()` is called with no DI override, so a real run would act on real Supabase orders and could issue real Razorpay refunds. Only the secret check itself (401 on missing/wrong/malformed bearer) is proven at the route level; the reconcile business logic is already covered against local Postgres with mocked Razorpay in `payments.test.ts`.
- **Concurrency tests exist at two levels now, not by accident:** `coupons.test.ts`/`inventory` tests race the bare service function (`redeemCoupon`, `reserveStock`) directly; `checkout.test.ts` additionally races the full `createOrder` orchestration (10-way stock, 8-way shared coupon) to prove the atomic guarantee still holds through the whole order-creation transaction, not just in the isolated primitive.

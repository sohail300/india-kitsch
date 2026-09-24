# Checkout, Razorpay Payments & Order Lifecycle

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 9. Checkout & Razorpay payment flow

**Preconditions:** logged-in + email-verified; cart non-empty; address selected.

1. **`/checkout`.** Unauthenticated users are redirected to `/login?returnTo=/checkout`; the cart persists. The customer picks or creates an address (server validates pincode `^\d{6}$`, state, phone) and may enter a coupon (server-validated preview only).
2. **`createOrder` Server Action.** Input: `{lines:[{variantId,qty}], addressId, couponCode?, idempotencyKey}`. **No prices, no totals from the client.** The server:
   1. authenticates; rate-limits; resolves the idempotency key (returns the existing order if present);
   2. loads variants + products from the DB; rejects archived/inactive; computes line prices (variant price ?? product price), subtotal, coupon discount (allocated per line), shipping (flat fee / free above threshold from `store_settings`) and the GST component (inclusive), all in integer paise with deterministic rounding, in one `pricing.ts` used everywhere;
   3. **creates the Razorpay order first** (`POST /v1/orders`, `amount` in paise, `currency: INR`, `receipt`, notes). If this fails nothing has changed locally, and an orphan unpaid Razorpay order is harmless. This HTTP call happens **outside** any DB transaction;
   4. opens **one Postgres transaction** that first **lazily releases expired reservations** for the requested variants (pending orders past `expiresAt` become `cancelled` with reason `expired`, stock returned; this is what frees stock promptly without a frequent cron; the rare "customer paid after expiry" case is covered by the reconciler's late-payment path), then inserts `orders` (`pending_payment`, `expiresAt = now + 5 min`, address snapshot), `order_items` (snapshots), `payments` (`created`), `order_events`; **reserves stock** with the conditional `UPDATE` from §11 (ascending variant order); writes `stock_movements(reserve)`; and increments coupon usage + inserts `coupon_redemptions` with the same conditional pattern. Any failure (out of stock, coupon exhausted, unique-key conflict) rolls the whole transaction back and returns a typed `out_of_stock` / `coupon_exhausted` / `price_changed` result;
   5. returns `{orderId, orderNumber, razorpayOrderId, amount, keyId, prefill}`.
3. **Client opens Razorpay Checkout** (script loaded lazily only on this page) with its `timeout` option set to 300 seconds, matching the 5-minute hold, so the modal can't be used after the reservation has expired. A payment started just before the deadline can still complete after it; that case is covered by the reconciler (step 7). The UI shows a visible countdown. Card/UPI data never touches our servers.
4. **Success handler → `verifyPayment` action (UX fast path only).** Recompute `HMAC_SHA256(razorpayOrderId + "|" + razorpayPaymentId, KEY_SECRET)`, constant-time compare; then **fetch the payment from the Razorpay API** and confirm `status = captured`, matching `order_id`, `amount == order.totalPaise`, `currency == INR`; then call `markOrderPaid(orderId)` and redirect to the confirmation page. Requires Razorpay **auto-capture** enabled.
5. **Webhook `POST /api/webhooks/razorpay` is the source of truth.** Read the **raw body** (`await request.text()`), verify `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with the webhook secret); insert into `webhook_events` keyed by `X-Razorpay-Event-Id` (duplicate ⇒ 200 no-op). Handle `payment.captured` / `order.paid` → `markOrderPaid`; `payment.failed` → record the attempt (order stays `pending_payment`, the customer may retry on the same Razorpay order); `refund.processed|failed` → update `refunds`. Always verify amount/currency/order linkage. Respond 200 quickly; email via `after()`.
6. **`markOrderPaid` is idempotent and shared** by steps 4, 5 and the reconciler. One transaction: `UPDATE orders SET status='paid', paid_at=now() WHERE id=:id AND status='pending_payment'` (must change exactly 1 row, otherwise it's a no-op), convert the reservation to a sale (`on_hand -= q, reserved -= q`), `stock_movements(sale)`, `payments → captured`, `order_events`; then send the confirmation email.
7. **Reconciler (every 10 min, cron Worker → `/api/cron/reconcile`, see §18):** for `pending_payment` orders past `expiresAt`, **first ask Razorpay** whether a captured payment exists (lost webhook) → `markOrderPaid`; otherwise cancel and release the reservation. Also detect _late payments_ on already-cancelled orders: re-reserve if stock allows and mark paid, else auto-refund and email the customer. Any mismatch alerts the owner. The endpoint is idempotent and requires the bearer secret.
8. **Refunds:** admin action → server calls the Razorpay refund API (full or partial), records `refunds`, finalised by the `refund.processed` webhook; restock is an explicit admin choice.

## 10. Order lifecycle

```
pending_payment ──paid──► paid ──► processing ──► shipped ──► delivered
      │                     │           │                          │
      └─(expiry/user)─► cancelled ◄─────┘ (admin, with refund)     └─► refunded (full)
                     paid/processing/shipped/delivered ──► refunded
```

| From → To                   | Who                           | Guard / side effects                                                                       |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| pending_payment → paid      | webhook / verify / reconciler | signature + amount match; reservation → sale; email                                        |
| pending_payment → cancelled | customer, cron (expiry)       | release reservation; coupon usage returned                                                 |
| paid → processing           | admin                         | none                                                                                       |
| processing → shipped        | admin                         | **courier + tracking number required**; email with tracking                                |
| shipped → delivered         | admin                         | none                                                                                       |
| paid/processing → cancelled | admin                         | **refund required** (Razorpay), restock, email                                             |
| any paid state → refunded   | admin                         | full refund complete; partial refunds tracked in `refundedPaise` while status is unchanged |

A single `transition(order, to, actor)` function validates against this table, uses **optimistic concurrency** (`UPDATE … WHERE id=:id AND status=:from`, require 1 row), writes `order_events`, and triggers notifications. No other code writes `orders.status`. Customers can self-cancel only while `pending_payment`; after payment they contact support (admin cancels and refunds). A return/exchange _workflow_ is out of scope; the admin records refunds manually.

## Implementation notes (Phase 6 — built and verified against real Postgres, Razorpay HTTP mocked per docs/09 §20)

- **The table above has one more real edge than the diagram shows: `cancelled → paid`.** Used only by the reconciler's late-payment path (step 7) — a payment that completes after its order was already auto-cancelled for expiry. `orders/stateMachine.ts`'s `TRANSITIONS` map includes it explicitly.
- **The "lazily release expired reservations" step (step 2iv) runs _before_ pricing, not inside the final reservation transaction as the numbered list above suggests.** `createOrder` calls it, then `quoteCart`, then opens the transaction that actually reserves stock. Reason: `quoteCart`'s availability read has to see the freed-up stock, or a shopper stays blocked by a stale hold for the exact duration the lazy release exists to avoid. `reserveStock`'s atomic conditional `UPDATE` in the final transaction is still what actually guarantees correctness against a third party grabbing the stock in the gap between the two steps — the early release is a courtesy, not the correctness mechanism. Verified directly: `tests/integration/checkout.test.ts`'s "lazily releases an already-expired pending order's reservation" case.
- **`createOrder` treats `quoteCart` strictly, not advisorily.** Any line that isn't exactly `"ok"` (unavailable, quantity reduced for stock, archived, not found) blocks the whole order with a `cart_changed` result rather than silently proceeding with a smaller quantity the way the cart page's live preview would. `reserveStock`'s atomic check is still the real gate against a race that slips past this pre-check.
- **The reconciler's late-payment lookback window is 24 hours** (`LATE_PAYMENT_LOOKBACK_HOURS` in `payments/reconcile.ts`) — not specified in the original plan. A payment completing more than a day after a 5-minute hold expired is unlikely enough that a later one is a support case, not something to keep auto-checking forever.
- **Owner-email on a mismatch/late-refund is still a TODO** — `reconcileExpiredOrders`'s `alerts` array and `logger.warn` calls are where that hook goes; distinct from the 6 customer-facing templates Phase 8 actually built (owner alerting was never one of the named templates).

## Implementation notes (Phase 8 — built and verified against the real Resend API, per docs/09 §20)

- **Confirmation/shipped/cancelled/refunded emails are sent via a plain awaited call after the DB transaction commits, not wrapped in Next's `after()`** as step 5 above says. `after()` only works inside a real Next.js request context (a Server Action or Route Handler) — `markOrderPaid`, `markOrderShipped`, `refundOrder` and `cancelPaidOrder` are plain, framework-agnostic service functions called directly from Vitest integration tests with no such context, the same reason cache-tag revalidation (docs/05 §7, docs/07's Phase 7 notes) isn't called directly either. A failed send is caught and logged inside `notifications/service.ts`, never thrown — it can't roll back an order that's genuinely paid/shipped/refunded.
- **`payments/settle.ts`'s late-payment reinstate path sends its own confirmation email** (`sendOrderConfirmationEmail`, not via `markOrderPaid`) since reinstatement drives its own `cancelled -> paid` transition and bypasses `markOrderPaid` entirely.
- **Every order/payment function that might send an email takes an injectable `EmailSender`** (`markOrderPaid`, `markOrderShipped`, `refundOrder`, `cancelPaidOrder`, `verifyPayment`, `handleRazorpayWebhook`, `reconcileExpiredOrders`, `settleCapturedPayment`), same DI pattern as `RazorpayClient`, defaulting to the real Resend-backed singleton. Every existing Phase 6/7 test that calls these had to be updated to pass an explicit no-op `mockEmailSender` — without it, `RESEND_API_KEY` being a real key meant those tests started silently emailing fake `@indiakitsch.test` addresses via the real API on every run.

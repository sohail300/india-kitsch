# Authentication, Authorization & Security

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 5. Authentication / authorization

- **Sessions:** Better Auth, database-backed sessions in Postgres. The browser holds an opaque random token in an `httpOnly; Secure; SameSite=Lax` cookie; the server looks it up. **This is deliberately not JWT-in-localStorage:** a DB session can be revoked instantly (logout, password change, disabling a customer or admin), and a token in `localStorage` is exposed to any XSS. To avoid a DB read on every request (saves DB round-trips on a small shared instance, and Hobby CPU is limited), enable Better Auth's short-lived signed **cookie cache**; it gives token-like speed with server-side revocation once the cache window expires. _(Verify the supported cookie-cache formats in Phase 0.)_
- **Sign-in methods:** email + password (min length, rate-limited, Turnstile on register) and Google. **Email verification is required before checkout** (prevents fake accounts, guarantees order emails). Password reset by emailed token. Link Google to an existing account only when the email is verified on both sides (prevents account takeover).
- **Password hashing** (scrypt by default) runs on Vercel's Node runtime, which has no 10 ms cap; measure it in Phase 0 to size the Active-CPU budget.
- **Roles:** `customer`, `admin`. **No public admin signup.** Admins are created by `scripts/create-admin.ts` or promoted directly in the DB by the owner. Admin accounts require **2FA (TOTP)** before launch.
- **Authorization lives in the Data Access Layer, not in `proxy.ts` or layouts.** Per the Next 16 authentication guide, `proxy.ts` is for optimistic redirects only and layouts don't re-render on navigation. So `requireUser()` / `requireAdmin()` are called at the top of **every** protected page, Server Action and Route Handler, and every customer query is scoped `WHERE user_id = session.user.id` (no IDOR). `proxy.ts`, if used at all, only redirects when no session cookie exists.
- **CSRF:** Server Actions enforce same-origin; mutating Route Handlers check `Origin`; the webhook is authenticated by HMAC signature; cron endpoints by a bearer secret.
- Before coding, read `node_modules/next/dist/docs/01-app/02-guides/authentication.md` and `authentication-with-cache-components.md`.

## 14. Security considerations

- **Pricing/stock integrity:** the client sends ids and quantities only; all money is computed server-side from the DB, snapshotted in `orders`, and the payment amount is re-verified against the order total at verify and webhook time.
- **AuthN/Z:** DAL checks (§5), admin 2FA, ownership-scoped queries, no role from client input.
- **Payments:** constant-time signature verification, raw-body webhook verification, event-id idempotency, amount/currency/order-id cross-checks, secrets only in Vercel encrypted env vars, test/live keys strictly separated by environment. **Preview deployments must never hold live keys.**
- **Input:** Zod everywhere; Drizzle parameterises SQL; escape `LIKE`/`ILIKE` wildcards; product text rendered as text (no `dangerouslySetInnerHTML` on user/admin content unless sanitised).
- **Uploads:** admin-only presign endpoint, declared type/size signed into the URL, server-side verification of size and magic bytes before the DB row is created, random keys, no user-supplied paths.
- **Headers/CSP:** strict CSP allowing only self, `checkout.razorpay.com`, `api.razorpay.com` (frame + connect), `lumberjack.razorpay.com`, `img.<domain>`, Turnstile; HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, Permissions-Policy. Set via `next.config.ts` headers.
- **Abuse:** Turnstile, per-IP/per-account rate limits (Better Auth built-in; custom limiter table for coupon apply, checkout creation, contact form), Cloudflare WAF managed rules on `img.` and any proxied hostname.
- **Database:** TLS only, least-privilege DB roles (app role cannot drop/alter; migrations use a separate role/connection string), transaction-pooler URL for the app, session-pooler URL only for migrations and dumps.
- **Supabase REST/Data API lockdown (§4):** app tables live in a private `app` schema that REST cannot see; RLS deny-all on every table; only a one-row `keepalive` schema is exposed for the keep-alive ping. **The `service_role` key is never created or stored** (it bypasses RLS) and Supabase's client SDKs are not used. Phase 0 test: the anon key must not be able to read any app table.
- **Secrets/supply chain:** GitHub secret scanning + push protection, Dependabot, `npm audit` in CI, pinned lockfile, minimal dependencies, R2 API tokens scoped to specific buckets.
- **Privacy/legal:** collect minimum PII; logs exclude PII/secrets; provide a data-deletion request path (India **DPDP Act 2023**, confirm obligations with a lawyer). Privacy/Terms/Refund/Shipping pages are required by Razorpay activation anyway. Card data never touches our servers (PCI SAQ-A via Razorpay Checkout).
- **Account security:** 2FA on Vercel, Supabase, Cloudflare, GitHub, Razorpay and Resend; at least two recovery-capable owners on each critical account.

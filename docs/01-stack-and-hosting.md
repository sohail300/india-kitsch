# Stack, Hosting & Architecture

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 0. Stack decision record

**Chosen:** Next.js 16 on **Vercel Hobby** + **Supabase Postgres (Free), used purely as a Postgres database** + **Cloudflare R2** (images, backups) + Cloudflare DNS/Turnstile, with **Drizzle ORM**.

**Why:** hosting budget is ₹0 for now. Vercel is the reference platform for Next.js 16 (verified adapter, every feature works, no CPU cap that breaks SSR). Supabase Free gives real Postgres (interactive transactions and row locking, which stock and order integrity need), stays awake between requests (no cold starts) and, per its pricing page, has no monthly compute-hours cap _(verify in Phase 0)_.

**Why Supabase over Neon (settled):** Neon Free suspends compute after 5 idle minutes and gives only 100 CU-hours a month, which steady traffic can exhaust; it also forced us to keep background jobs infrequent. Supabase Free trades that for a different weakness (pauses after a week of inactivity, no backups), both of which we can engineer around cheaply (below). Both are 500 MB. **Neon (Launch, pay-as-you-go) stays the paid fallback**; because we use only plain Postgres, moving is a dump/restore plus a connection-string change.

**Rule that keeps switching cheap:** use Supabase only as Postgres over a normal connection string. Do **not** use its Auth, Storage, Realtime, Edge Functions, client SDKs, or the `service_role` key.

### Accepted risks (the price of ₹0)

1. **Vercel's terms restrict Hobby to non-commercial use.** Their fair-use page defines commercial use as any deployment tied to financial gain of anyone involved, including a paid consultant, and any site that requests or processes payments. Vercel may pause a deployment or account that breaks this; I can't say how often they enforce it. The business owner should be told this in writing (§29 #1). Mitigation: the app is a standard Next.js + Postgres app, so moving to Vercel Pro ($20/mo) is a plan change with no code change, and moving to another Node host (Docker on Fly/Railway/a VPS) is a day of work. Because DNS is in Cloudflare, cutover is a DNS change.
2. **Supabase Free pauses a project after 1 week of inactivity**, and un-pausing is a manual dashboard action; the store would be down until someone restores it. Mitigation: a **daily keep-alive ping via the REST API** from the Cloudflare cron Worker, for both production and staging (§18), plus real traffic and the frequent backup dumps (which also connect over SQL). _Verify in Phase 0 that a REST request counts as activity, and that Supabase's terms have no objection to keep-alive pings._
3. **Supabase Free has no backups and no point-in-time recovery.** Mitigation: our own encrypted `pg_dump` **every 12 hours**, a **dump before every migration**, off-platform copies, a weekly rolling-retention prune, and a freshness alarm (§16). Worst-case data loss is about 12 hours of changes — accepted as adequate at this order volume; Razorpay's records let us reconcile payments if it ever matters.
4. **Enabling the REST API exposes tables to anyone holding the public anon key.** The keep-alive needs REST, so the database is locked down by design (§4, §14): app tables in a **private `app` schema**, RLS deny-all on every table, and only a one-row `keepalive` schema exposed. If Phase 0 shows SQL activity also prevents pausing, the Data API is disabled entirely instead.
5. **500 MB per project, shared CPU, 500 MB RAM (Micro instance), 60 direct / 200 pooler connections.** Enough for tens of thousands of orders (≈5 KB per order all-in, an estimate); images live in R2. Alert at 400 MB. Keep queries indexed and connections small.
6. **Only 2 active free projects**: production + staging. Development uses local Docker Postgres.
7. **Pooler quirks:** Vercel connects through Supabase's **transaction pooler**, which doesn't support prepared statements (Drizzle needs `prepare: false` with `postgres-js`, or use `pg`). Migrations and dumps run from IPv4-only CI, and Supabase direct connections are IPv6, so CI uses the **session pooler** _(verify)_.

### Free-tier limits that shape the design

| Service          | Limit (Free / Hobby)                                                                                        | Design consequence                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Vercel Hobby     | 100 GB transfer, 1M function invocations, **4 hours Active CPU**, 5K image transformations per month        | Static/cached pages wherever possible; **don't use Vercel image optimization** (custom loader, §15) |
| Vercel Hobby     | Cron jobs limited to once per day _(verify)_                                                                | Frequent jobs run from a free Cloudflare cron Worker calling a protected endpoint (§18)             |
| Vercel functions | ~4.5 MB request body limit _(verify)_                                                                       | Image uploads go browser → R2 directly via presigned URL (§12)                                      |
| Supabase Free    | 500 MB DB, Micro shared instance, 5 GB egress, 2 active projects, pauses after 1 week idle, no backups/PITR | Keep-alive; own dumps; size alert; prod + staging only                                              |
| R2 Free          | 10 GB storage, no egress fees                                                                               | Product images, backups                                                                             |
| Resend Free      | 3,000 emails/mo, 100/day                                                                                    | Transactional email only                                                                            |

### Upgrade triggers (decide before they bite)

| Trigger                                                                            | Action                                                                                                                                                                                                                             | Cost                                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Vercel warning/pause, or first real revenue if the owner prefers to be compliant   | Vercel **Pro**                                                                                                                                                                                                                     | ~$20/mo per seat                                                       |
| DB > 400 MB, or losing up to 6 h of orders would hurt, or a pause/keep-alive scare | **Supabase Pro** (8 GB, 7-day daily backups; point-in-time recovery is a separate add-on, ~$100/mo) **or Neon Launch** (pay-as-you-go, 7-day history, no monthly minimum). Choose by price at the time; migration is dump/restore. | Supabase Pro from $25/mo; Neon roughly $0.106/CU-hour + $0.35/GB-month |
| Vercel Active CPU or invocations > 70% of Hobby allowance                          | Vercel Pro                                                                                                                                                                                                                         | as above                                                               |

### Why not D1 + Workers (settled, kept for the record)

Workers Free allows only 10 ms CPU per request, which Next.js SSR typically exceeds; D1 isn't reachable from Vercel without a slow HTTP API; D1 has no interactive transactions; D1 Free is 500 MB _per database_, the same as Supabase and Neon. Hence dropped.

## 1. Recommended overall architecture

A **modular monolith**: one Next.js app on Vercel, one Supabase Postgres database, one R2 bucket family. No microservices, no queues in v1.

```
                        Cloudflare DNS (DNS-only for the app)  ·  Turnstile
                                        |
   Browser  ---------------------->  Vercel (Next.js 16, region near the DB)
     |                                   |  Server Components (reads, cached)
     |  Razorpay Checkout modal          |  Server Actions (mutations)
     |  (checkout.razorpay.com)          |  Route Handlers: /api/auth/*, /api/webhooks/razorpay,
     |                                   |    /api/admin/uploads/*, /api/cron/*, /api/health
     |                                   |
     |                                   |--> Supabase Postgres via transaction pooler (SQL, TLS)
     |                                   |--> R2 via S3 API (presigned uploads)  --> img.<domain> (Cloudflare CDN)
     |                                   |--> Razorpay API (server-to-server)
     |                                   '--> Resend (email)
     |
     '--- direct PUT of images to R2 (presigned URL)

   Cloudflare cron Worker (every 10 min) --> POST /api/cron/reconcile (Bearer CRON_SECRET)
   Cloudflare cron Worker (daily)        --> REST keep-alive ping (prod + staging) + backup-freshness check
   GitHub Actions (every 12h)            --> pg_dump --> age-encrypt --> R2 backups + off-Cloudflare copy
   GitHub Actions (weekly)               --> prune-backups.ts (rolling retention)
   Razorpay webhooks                     --> /api/webhooks/razorpay (signature-verified; source of truth)
```

Principles:

- **Server is authoritative** for price, stock, coupons, shipping, tax, totals and order state.
- **Layering:** UI/action/route (parse, authenticate, Zod-validate) → **service** (business rules, transactions) → **repository** (Drizzle queries). Business logic never lives in components or route handlers.
- **Money = integer paise**, never floats. Timestamps stored UTC (`timestamptz`), displayed IST.
- **Expand/contract migrations** so a deploy never breaks the running version.
- **Never hold a DB transaction open across an HTTP call** (Razorpay, R2, email).

## 2. Technology choices (and why)

| Area            | Choice                                                                                    | Why / notes                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | **Next.js 16.3.5** (App Router, strict TS), already installed                             | Given. Breaking changes vs older Next: `middleware`→`proxy.ts`, Cache Components, Build Adapters. **Read the matching guide in `node_modules/next/dist/docs/` before each feature** (AGENTS.md rule). |
| Host            | **Vercel Hobby**                                                                          | Verified Next.js adapter; every Next 16 feature supported; zero-config deploys and previews. Terms risk in §0.                                                                                        |
| Database        | **Supabase Postgres (Free)**, plain Postgres only                                         | Always-on, real transactions and row locking, portable to any Postgres host (Neon, Supabase Pro, self-hosted). Supabase-specific features deliberately unused (§0).                                   |
| ORM             | **Drizzle ORM** (`postgres-js` with `prepare: false`, or `pg`) + `drizzle-kit` migrations | Light, SQL-close, typed, first-class interactive transactions. Prisma 7 would also work on Postgres; Drizzle chosen for small footprint and because you were happy with either.                       |
| Validation      | **Zod** at every boundary + a Zod-validated `env.ts`                                      | One source of truth for input shapes; shared with forms.                                                                                                                                              |
| Auth            | **Better Auth** (Drizzle adapter)                                                         | Actively maintained (Auth.js now sits under the same org); email+password, Google, verification, reset, roles, 2FA, rate limiting. Avoids hand-rolled crypto. Supabase Auth is not used.              |
| Payments        | **Razorpay via plain `fetch` + HMAC** (no SDK)                                            | Only three endpoints (create order, fetch payment, refund); small, auditable.                                                                                                                         |
| UI              | **Tailwind 4** + **shadcn/ui** (Radix) + `react-hook-form`                                | Accessible, owned code; enough for admin tables/forms without an admin framework.                                                                                                                     |
| Email           | **Resend** behind an `EmailSender` interface                                              | Free tier, simple API, swappable.                                                                                                                                                                     |
| Bot protection  | **Cloudflare Turnstile**                                                                  | Free; register, contact, forgot-password.                                                                                                                                                             |
| Files           | **R2** (S3 API, presigned PUT)                                                            | Free 10 GB, no egress fees, CDN at `img.<domain>`. Supabase Storage is not used.                                                                                                                      |
| Scheduled jobs  | **Cloudflare cron Worker** → protected endpoints                                          | Free; 10-minute reconciler, daily keep-alive (Vercel Hobby cron is daily-only).                                                                                                                       |
| Errors          | **Sentry** (free)                                                                         | First-class Next.js SDK; Hobby log retention is short (§21).                                                                                                                                          |
| Analytics       | **Cloudflare Web Analytics**                                                              | Free, cookieless.                                                                                                                                                                                     |
| CI/CD           | **GitHub Actions** + Vercel Git integration                                               | Checks, tests, migrations, backups.                                                                                                                                                                   |
| Package manager | **npm** (repo already has `package-lock.json`)                                            | Don't change tooling without reason.                                                                                                                                                                  |
| Testing         | **Vitest** (real Postgres), **Playwright**, axe                                           | §20.                                                                                                                                                                                                  |

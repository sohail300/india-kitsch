# Project Structure & Local Development

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 3. Project / folder structure

```
india-kitsch/
├─ src/
│  ├─ app/
│  │  ├─ (store)/                       # public storefront layout (header/footer/cart drawer)
│  │  │  ├─ page.tsx                    # home
│  │  │  ├─ shop/page.tsx               # listing + filters (searchParams)
│  │  │  ├─ c/[slug]/page.tsx           # category
│  │  │  ├─ p/[slug]/page.tsx           # product detail
│  │  │  ├─ search/page.tsx
│  │  │  ├─ cart/page.tsx
│  │  │  ├─ checkout/page.tsx           # requires session
│  │  │  ├─ orders/[number]/confirmation/page.tsx
│  │  │  ├─ account/{page,orders,orders/[number],addresses}/…
│  │  │  ├─ (auth)/{login,register,forgot-password,reset-password,verify-email}/…
│  │  │  └─ (content)/{about,contact,faq,privacy,terms,returns,shipping,size-guide}/page.tsx
│  │  ├─ admin/                         # own layout, noindex, every page calls requireAdmin()
│  │  │  ├─ page.tsx (dashboard)  products/  categories/  inventory/
│  │  │  ├─ orders/  customers/  coupons/  settings/
│  │  ├─ api/
│  │  │  ├─ auth/[...all]/route.ts      # Better Auth
│  │  │  ├─ webhooks/razorpay/route.ts
│  │  │  ├─ admin/uploads/{sign,commit}/route.ts
│  │  │  ├─ cron/{reconcile,sweep}/route.ts   # Bearer CRON_SECRET only
│  │  │  └─ health/{route.ts, deep/route.ts}
│  │  ├─ sitemap.ts  robots.ts  error.tsx  not-found.tsx  layout.tsx  globals.css
│  ├─ proxy.ts                          # optional, optimistic redirects only (never the security boundary)
│  ├─ server/                           # `import "server-only"`; never bundled client-side
│  │  ├─ db/{client.ts, schema/*.ts, seed.ts}
│  │  ├─ auth/{auth.ts, config.ts, session.ts}  # config.ts is the unguarded, script-reusable Better Auth setup; session.ts is the DAL (getSession, requireUser, requireAdmin)
│  │  ├─ modules/
│  │  │  ├─ catalog/     {queries.ts, service.ts, schemas.ts, cache-tags.ts}
│  │  │  ├─ cart/        {quote.ts}
│  │  │  ├─ checkout/    {createOrder.ts}                     # pricing.ts moved to lib/ (below) — cart's quote also needs it, and it's pure/DB-free
│  │  │  ├─ orders/      {service.ts, stateMachine.ts, queries.ts}
│  │  │  ├─ inventory/   {service.ts, queries.ts}
│  │  │  ├─ coupons/     {service.ts, validate.ts, discount.ts, schemas.ts}  # discount.ts: pure amount math; validate.ts: DB eligibility preview; service.ts: atomic conditional-UPDATE redemption
│  │  │  ├─ payments/    {razorpay.ts, verify.ts, webhook.ts, reconcile.ts}
│  │  │  ├─ media/       {r2.ts, uploads.ts}
│  │  │  ├─ customers/   notifications/
│  │  │  ├─ settings/    {queries.ts, schemas.ts}              # store_settings typed accessors (shipping fee/threshold, ...)
│  │  ├─ lib/{money.ts, pricing.ts, tax.ts, ids.ts, errors.ts, logger.ts, rate-limit.ts, env.ts, email.ts}  # pricing.ts: the one place order totals are computed (docs/06 §9); email.ts: swappable EmailSender interface, console driver until Phase 8's Resend driver
│  ├─ components/{ui (shadcn), store, admin, shared}
│  ├─ lib/                              # client-safe helpers only
│  └─ content/{faq.ts, size-guides.ts, policies/*.mdx}
├─ drizzle/                             # generated SQL migrations (committed)
├─ cron-worker/                         # tiny Cloudflare Worker: scheduled() → POST /api/cron/*
├─ tests/{unit, integration, e2e, setup}         # setup/: Vitest bootstrap (server-only stub, .env.local loader)
├─ scripts/{create-admin.ts, backup-db.ts, prune-backups.ts, local-db-init.sql, lib/backup-retention.ts}
├─ docs/                                # this documentation set + runbooks/ (e.g. runbooks/restore.md)
├─ compose.yaml                         # local Postgres 16 for integration tests (docs/09 §20)
├─ vercel.json  drizzle.config.ts  .env.example
└─ .github/workflows/{ci.yml, migrate.yml, backup.yml, prune-backups.yml}
```

Rules: pages/actions stay thin; modules own the rules; only `server/` touches the DB; a module imports another module's _service_, never its repository. "Modules" is a code-organisation convention inside the same app; it doesn't change how requests are served and it doesn't replace Route Handlers (those are used wherever HTTP is genuinely required).

## 17. Local development setup

- **Prereqs:** Ubuntu (native or WSL2; CI also runs Ubuntu), Node 22 LTS, Git, a Docker-compatible engine for local Postgres (Docker Desktop, or Podman + `podman compose` — either works with `compose.yaml` as written). If using WSL2, keep the repo in the Linux filesystem (e.g. `~/projects/india-kitsch`), not under `/mnt/d/`; file watching and `npm install` are much slower across the mount.
- **Integration-test database:** `docker compose up -d` (or `podman compose up -d`) starts Postgres 16 (`compose.yaml`), with `scripts/local-db-init.sql` creating stand-in `anon`/`authenticated` roles so migration 0001's Supabase-role grants/revokes apply unchanged (docs/03 §4 "Portability note"). Point `TEST_DATABASE_URL` (`.env.example`) at it, then `npx tsx tests/setup/migrate-test-db.ts` to migrate it. `tests/integration/*` use this database exclusively — **never Supabase** (docs/09 §20) — via an injectable `dbHandle` argument (default: the app's real `db`; tests pass one bound to `TEST_DATABASE_URL` instead). CI runs the identical flow against a GitHub Actions Postgres service container (`.github/workflows/ci.yml`), so no Supabase credentials are needed in CI at all.
- **App dev database:** in practice this project runs `npm run dev` directly against the real Supabase project (`DATABASE_URL` in `.env.local`) rather than the local container — simpler for a single-developer project already relying on "verify against real infrastructure," at the cost of local writes touching a shared free-tier DB. Migrations: `npm run db:generate` (drizzle-kit) → `npm run db:migrate` → `npm run db:seed`.
- **Env vars:** `.env.local` (gitignored) holds Razorpay **test** keys, `DATABASE_URL` (Supabase — see above), `TEST_DATABASE_URL` (local, integration tests only), Better Auth secret, Google OAuth dev client, Resend key (or a console email driver), R2 credentials for a **dev bucket**. `.env.example` is committed. `vercel env pull` can sync Preview values when needed.
- **Razorpay webhooks locally:** Cloudflare Tunnel (`cloudflared`) → set the tunnel URL as the test webhook in Razorpay.
- **Production-like check:** `npm run build && npm run start` before merging anything touching caching (Cache Components behaves differently in `dev`).
- **Quality gates:** ESLint (`eslint-config-next`), `tsc --noEmit`, Prettier, Vitest.
- **Housekeeping (Phase 0):** commit the current cleanup (deleted default SVGs, edited `page.tsx`), adopt one default branch name (repo is on `master`; the remote's main is assumed `main`), protect it, PR-only merges with CI.

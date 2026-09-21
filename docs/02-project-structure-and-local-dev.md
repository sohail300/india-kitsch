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
│  │  ├─ auth/{auth.ts, session.ts}     # getSession, requireUser, requireAdmin (the DAL)
│  │  ├─ modules/
│  │  │  ├─ catalog/     {queries.ts, service.ts, schemas.ts}
│  │  │  ├─ cart/        {quote.ts}
│  │  │  ├─ checkout/    {createOrder.ts, pricing.ts}
│  │  │  ├─ orders/      {service.ts, stateMachine.ts, queries.ts}
│  │  │  ├─ inventory/   {service.ts, queries.ts}
│  │  │  ├─ coupons/     {service.ts, validate.ts}
│  │  │  ├─ payments/    {razorpay.ts, verify.ts, webhook.ts, reconcile.ts}
│  │  │  ├─ media/       {r2.ts, uploads.ts}
│  │  │  ├─ customers/   notifications/   settings/
│  │  ├─ lib/{money.ts, tax.ts, ids.ts, errors.ts, logger.ts, rate-limit.ts, env.ts}
│  ├─ components/{ui (shadcn), store, admin, shared}
│  ├─ lib/                              # client-safe helpers only
│  └─ content/{faq.ts, size-guides.ts, policies/*.mdx}
├─ drizzle/                             # generated SQL migrations (committed)
├─ cron-worker/                         # tiny Cloudflare Worker: scheduled() → POST /api/cron/*
├─ tests/{unit, integration, e2e}
├─ scripts/{create-admin.ts, backup-db.sh, restore-drill.md}
├─ docs/                                # this documentation set + runbooks/
├─ compose.yaml                         # local Postgres 16
├─ vercel.json  drizzle.config.ts  .env.example
└─ .github/workflows/{ci.yml, migrate.yml, backup.yml}
```

Rules: pages/actions stay thin; modules own the rules; only `server/` touches the DB; a module imports another module's _service_, never its repository. "Modules" is a code-organisation convention inside the same app; it doesn't change how requests are served and it doesn't replace Route Handlers (those are used wherever HTTP is genuinely required).

## 17. Local development setup

- **Prereqs:** Ubuntu (native or WSL2; CI also runs Ubuntu), Node 22 LTS, Git, Docker (for local Postgres). If using WSL2, keep the repo in the Linux filesystem (e.g. `~/projects/india-kitsch`), not under `/mnt/d/`; file watching and `npm install` are much slower across the mount.
- **Database locally:** `docker compose up -d` starts Postgres 16 (`compose.yaml`). Local and test databases never touch Supabase (its free tier has only 2 projects, both reserved for staging and production).
- **Flow:** `npm run dev` → `npm run db:generate` (drizzle-kit) → `npm run db:migrate` → `npm run db:seed` (categories, ~20 products with variants and stock, test coupons, an admin user).
- **Env vars:** `.env.local` (gitignored) holds Razorpay **test** keys, `DATABASE_URL` (local), Better Auth secret, Google OAuth dev client, Resend key (or a console email driver), R2 credentials for a **dev bucket**. `.env.example` is committed. `vercel env pull` can sync Preview values when needed.
- **Razorpay webhooks locally:** Cloudflare Tunnel (`cloudflared`) → set the tunnel URL as the test webhook in Razorpay.
- **Production-like check:** `npm run build && npm run start` before merging anything touching caching (Cache Components behaves differently in `dev`).
- **Quality gates:** ESLint (`eslint-config-next`), `tsc --noEmit`, Prettier, Vitest.
- **Housekeeping (Phase 0):** commit the current cleanup (deleted default SVGs, edited `page.tsx`), adopt one default branch name (repo is on `master`; the remote's main is assumed `main`), protect it, PR-only merges with CI.

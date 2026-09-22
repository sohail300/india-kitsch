# Server Architecture, Catalog, Cart & Performance

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 6. API / server architecture

- **Reads:** Server Components call module `queries`.
- **Mutations from our own UI:** Server Actions (`"use server"`). Each does _authenticate → Zod-parse → call service → return typed result_.
- **Route Handlers only where HTTP is required:** Better Auth, Razorpay webhook, admin upload presign/commit, cron endpoints, health checks.
- **Errors:** services return `{ ok: false, code, message }` for _expected_ failures (out of stock, coupon invalid, price changed) and throw only for bugs. `error.tsx` / `not-found.tsx` per segment; unexpected errors go to Sentry with a request id.
- **Idempotency:** `createOrder` takes a client-generated idempotency key (unique per user), so double-clicks return the same order.
- **Rate limits:** Better Auth built-in for auth endpoints; a small DB-backed limiter for coupon apply, checkout creation and contact form (a few writes per attempt, acceptable at this scale).
- **Background work:** `after()` (Next) for post-response work such as emails; scheduled work via protected cron endpoints (§18).
- **Config:** `env.ts` parses and validates all environment variables at boot with Zod; the app fails fast when misconfigured.

## 7. Product / catalog architecture

- **Public reads are cached; mutations invalidate.** Home, category and product pages are cached with tags; admin mutations revalidate the relevant tags (`products`, `product:<id>`, `category:<id>`).
- **Caching model — Phase 0 spike confirmed, Cache Components is the model.** `cacheComponents: true` is enabled in `next.config.ts`. Verified locally on Next 16.3.5 with a throwaway `"use cache"` + `cacheLife('hours')` component alongside a `connection()`-gated `Suspense` boundary: `next build`'s route summary labelled the route `◐ (Partial Prerender)` with `Revalidate 1h / Expire 1d`, matching `cacheLife('hours')` exactly; three requests against `next build && next start` returned an **identical** cached-component timestamp every time and a **different** random value every time — the static shell and the streamed dynamic content behaved exactly as documented. No fallback to classic ISR needed. Read `01-app/01-getting-started/08-caching.md` and the ISR guide before writing real cached components. Note from the docs: runtime `use cache` entries are in-memory per instance on serverless, so durable sharing (`use cache: remote`) pays off only at high hit rates; for the catalogue the static shell + tag revalidation is the main win.
- **Housekeeping note:** `cron-worker/` is a separate TS project (its own `package.json`/`tsconfig.json`, Workers-specific globals) living inside this repo. It's excluded from the root `tsconfig.json` and `eslint.config.mjs` — if `next build`'s type-check or `npm run lint` ever starts failing on files under `cron-worker/`, that exclusion is what broke.
- **Listing/filtering/sorting:** URL-driven (`/shop?category=&size=&color=&min=&max=&sort=&page=`); one server-side query with joins (no N+1), paginated. Facet values come from a cached query. Parameterised listing URLs get a canonical to the clean category URL and `noindex` to avoid duplicate-content SEO issues.
- **Live availability on PDP:** the page shell is cached, but per-variant "in stock / only 2 left" streams in fresh behind `Suspense` (or a short-TTL request), so cached HTML never lies about stock. Checkout is the only place that _decides_ stock.
- **Variants UX:** size + color selectors; color swaps the gallery to color-specific images; out-of-stock sizes shown disabled; variant price overrides displayed when set.
- **Size chart:** per-product `sizeChartId`, rendered in a modal/accordion on the PDP and on `/size-guide`.
- **SEO:** `generateMetadata`, JSON-LD `Product`/`Offer`/`BreadcrumbList`, `sitemap.ts` (active products/categories), `robots.ts`, canonical URLs, OG images per the Next metadata docs. Product slugs are immutable once published (or 301 on change).

## 8. Cart architecture

- **Client-side cart** in `localStorage` (versioned key) storing **only `{variantId, qty}`**, never prices. Works for anonymous browsing and survives login.
- **Why not a DB cart in v1:** every add/remove would be a DB write (extra load on a small shared instance), and it needs guest-cart merge logic. Deferred: cross-device sync and abandoned-cart email.
- **`quoteCart(lines)`** returns authoritative name, price, image, availability and totals (subtotal, shipping, estimated GST). It's called when the cart page/drawer opens and before checkout; it clamps quantities, flags unavailable/archived items, and the UI shows "price changed" notices. Per-line quantity cap (default 10).
- **Trust boundary:** the quote is _advisory_; `createOrder` recomputes everything again (§9).

## 15. Caching & performance strategy

1. **Static assets** (`_next/static`, fonts): immutable, served by Vercel's CDN.
2. **Images:** served from R2 via `img.<domain>` (Cloudflare CDN), immutable. **Vercel image optimization is not used** (Hobby allows only 5K transformations/mo); use a custom `next/image` loader (Cloudflare Image Transformations `/cdn-cgi/image/width=…,format=auto/…` on `img.<domain>`, with its own free allowance; _verify quota in Phase 4_), with a fallback of three pre-generated widths made client-side at upload.
3. **Pages:** cached/prerendered home, category and PDP (no DB hit while cached); dynamic islands (stock, session, cart) streamed via `Suspense`.
4. **Data:** indexed queries, select only needed columns, single-query joins, cached facets; pooled connections.
5. **Budget awareness on Hobby:** ~4 hours Active CPU/month and 1M invocations. Cached pages don't consume CPU; keep dynamic routes lean (no heavy libs, no server-side PDF or image processing), lazy-load the Razorpay script and admin charts.
6. **Supabase Free behaviour:** the database stays awake (no cold starts) but is a small shared Micro instance with a 500 MB cap, and the project **pauses after a week of no activity** (daily keep-alive, §18). Cached pages avoid the DB entirely; dynamic queries stay indexed and use the transaction pooler.
7. **Front-end:** `next/font`, responsive `sizes`, explicit image dimensions (no CLS), LCP image `priority`, bundle budget in CI. **Targets:** LCP < 2.5 s and INP < 200 ms on mid-range mobile/4G; Lighthouse ≥ 90 on home/PDP/listing.
8. **Region — decided: Mumbai.** The Supabase project is in the Mumbai region; set the Vercel function region to match (`bom1`) — function↔DB latency matters more than function↔user latency. *(Confirm this is actually set in the Vercel project's function region setting, not just the default.)*

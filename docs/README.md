# India Kitsch — E-commerce Architecture & Implementation Plan

## Context

India Kitsch is a small Indian clothing brand that needs a production e-commerce site: storefront, admin panel, Razorpay payments. The repo is a fresh `create-next-app` (Next.js **16.3.5**, React 19.2, Tailwind 4, npm, `src/app`). This documentation set is planning only; no application code exists yet.

**Non-negotiables from the brief:** server-authoritative prices and stock, real auth/authz, images in object storage, DB backups that don't depend on one laptop, ~zero hosting cost now, no rewrite when traffic grows, don't over-engineer v1.

## Decisions made

| Topic           | Decision                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting         | **Vercel Hobby** (free). Accepted risk: Vercel's terms restrict Hobby to non-commercial use. See [§0](./01-stack-and-hosting.md).                                                                                                          |
| Database        | **Supabase Postgres, Free plan, used purely as Postgres** (0.5 GB, always-on, no compute-hours cap, **no built-in backups**, pauses after 1 week idle so a daily REST keep-alive runs). Neon Launch / Supabase Pro are the paid fallbacks. |
| ORM             | **Drizzle** (Postgres)                                                                                                                                                                                                                     |
| Files / images  | **Cloudflare R2** (S3 API); Cloudflare for DNS, image CDN, Turnstile                                                                                                                                                                       |
| Customer auth   | Email + password and Google (Better Auth). Browsing and cart are open; **placing an order requires a logged-in, email-verified account**. No guest checkout.                                                                               |
| Payments        | Razorpay online only. **No COD** in v1.                                                                                                                                                                                                    |
| Shipping / tax  | Flat fee with free-above-threshold, GST-inclusive prices, manual fulfilment (admin enters courier + tracking). India-only, INR-only.                                                                                                       |
| Dev environment | **Ubuntu** (native or WSL2). Windows is not a supported dev target.                                                                                                                                                                        |

**Cost snapshot:** hosting ₹0. Unavoidable: domain (~₹1,000/yr) and Razorpay's per-transaction fee. Upgrade triggers (Vercel Pro, Supabase Pro or Neon Launch) are defined in §0.

## Document index

| File                                                                                        | Sections                         |
| ------------------------------------------------------------------------------------------- | -------------------------------- |
| [Stack, Hosting & Architecture](./01-stack-and-hosting.md)                                  | §0, §1, §2                       |
| [Project Structure & Local Development](./02-project-structure-and-local-dev.md)            | §3, §17                          |
| [Database Schema & Inventory](./03-database-and-inventory.md)                               | §4, §11                          |
| [Authentication, Authorization & Security](./04-auth-and-security.md)                       | §5, §14                          |
| [Server Architecture, Catalog, Cart & Performance](./05-server-catalog-cart-performance.md) | §6, §7, §8, §15                  |
| [Checkout, Razorpay Payments & Order Lifecycle](./06-checkout-payments-orders.md)           | §9, §10                          |
| [Image Storage & Admin Panel](./07-images-and-admin.md)                                     | §12, §13                         |
| [Backups, Deployment, Secrets & Monitoring](./08-infrastructure-backups-ops.md)             | §16, §18, §19, §21               |
| [Testing Strategy](./09-testing.md)                                                         | §20                              |
| [Phases & Roadmap (empty repo to production)](./10-roadmap.md)                              | §22, §26, verification gates     |
| [Risks, Out-of-Scope & Open Decisions](./11-risks-scope-decisions.md)                       | §27, §28, §29                    |
| [Next Steps: From Docs to Phase 0](./12-next-steps.md)                                      | Prerequisites, Phase 0 checklist |

**Mapping to the original 25-point request:** 1 Architecture → §1 · 2 Tech choices → §0, §2 · 3 Structure → §3 · 4 Schema → §4 · 5 Auth → §5 · 6 API → §6 · 7 Catalog → §7 · 8 Cart → §8 · 9 Checkout/Razorpay → §9 · 10 Order lifecycle → §10 · 11 Inventory → §11 · 12 Images → §12 · 13 Admin → §13 · 14 Security → §14 · 15 Caching/perf → §15 · 16 Backups → §16 · 17 Local dev → §17 · 18 Deployment → §18 · 19 Env/secrets → §19 · 20 Testing → §20 · 21 Monitoring → §21 · 22 Phases → §22 · 23 Implementation order → §26 · 24 Risks → §27 · 25 Out of scope → §28 · Ambiguities → §29.

**Read first:** [§0](./01-stack-and-hosting.md) (what the free stack costs you in risk), [§29](./11-risks-scope-decisions.md) (decisions still needed from the owner), and [12-next-steps.md](./12-next-steps.md) (what to actually do next).

Note on facts: figures for Vercel, Supabase, Neon and Cloudflare limits were read from their docs in September 2026. Anything marked _(verify)_ is from memory or unconfirmed and is checked in the Phase 0 spike. Re-check pricing pages before launch; free tiers change.

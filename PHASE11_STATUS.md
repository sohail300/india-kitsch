# Phase 11 — Admin panel UI: session status

Not a permanent docs file — a handoff note for this in-progress session, started 2026-09-24 on the go-ahead "do phase 11. refer public/ folder for the design... clean... light mode." Delete once the phase is committed and this is superseded by docs/07's Implementation notes.

## Why / direction

First-ever frontend code in this repo — before this session, `src/app` had only the default Next scaffold plus the Phase 0-9 API routes. Design direction: `public/` (owner's own files, read-only reference, never commit/move) holds screenshots of a "Horizon UI" free admin-dashboard template — white/light, indigo `#4318FF` accent, rounded-2xl cards, sidebar with an active-pill nav item. Built to match that: light mode only, no dark-mode toggle.

## Stack decisions / gotchas hit this session

- **Tailwind v4 + shadcn/ui** (`base-nova` style, `@base-ui/react` under the hood, not Radix). Installed via `npx shadcn@latest init -d` then `add` for ~20 components.
- **`@tanstack/react-table` was tried and reverted.** The installed version is v9 — a rewrite with a totally different API from the well-known v8 `useReactTable`/`getCoreRowModel` hooks API. Replaced with a small bespoke `DataTable` (`src/app/admin/_components/data-table.tsx`): a `columns: {header, cell}[]` array mapped over shadcn's `Table` primitives, no client table-state library.
- **react-hook-form + zod, but numeric fields are validated strings, not `z.coerce.number()`.** `z.coerce` broke `@hookform/resolvers`' generic inference (input type became `unknown`, mismatched against `useForm<FormValues>`). Convert with `Number(...)`/`toPaise(...)` inside the submit handler instead.
- **`form.watch("field")` used in JSX trips a React Compiler warning** ("incompatible library, can't memoize safely") — this repo has React Compiler on. Fixed everywhere by switching to `useWatch({ control: form.control, name: "field" })`.
- **Cache invalidation from admin Server Actions uses `updateTag`, not `revalidateTag`.** Next 16's `revalidateTag(tag, profile)` now requires a second `profile` arg (stale-while-revalidate semantics — wrong for "admin should see their own write immediately"). `updateTag(tag)` is the one-arg immediate-invalidation primitive; every admin `actions.ts` calls that.
- **`server-only` leaking into client bundles.** 5 client form components imported `toPaise`/`toRupees`/`formatINR` straight from `@/server/lib/money` (which has `import "server-only"`) — fails the build. Fixed with a new `src/app/admin/_lib/money-client.ts` holding client-safe duplicates of just those 3 pure functions; `server/lib/money.ts` itself left untouched (tested, Phase-0 module).
- **Next 16 Cache Components strictness (`cacheComponents: true`, already on pre-Phase-11).** Every page must prove it's static-shell-safe or explicitly dynamic. Since every admin page reads the session + hits Postgres live with no cache lifetime ("Admin pages are never cached" — docs/07 §13), fixed per Next's own documented "Migrating an existing app" escape hatch:
  - `export const instant = false;` on `(dashboard)/layout.tsx` (covers the whole admin subtree) and separately on `admin/login/page.tsx` (outside that layout; reads `searchParams`).
  - `await connection()` (from `next/server`, same pattern as the existing `api/health/route.ts`) added to the dashboard page specifically, since it calls bare `new Date()` to compute "today"'s boundary — flagged as a distinct error from the session-read one even with `instant=false` on the ancestor.
  - `npm run build` now completes clean; every `/admin/*` route shows as `ƒ` (Dynamic) or `◐` (Partial Prerender, for the `[id]` detail routes) — no `○` (fully static) admin route, which is the intended shape.

## Real backend gap found and fixed (not a UI issue — a missing Phase 7 mutation)

`docs/07-images-and-admin.md` §13 lists "per-variant price/stock" as in-scope for the Products admin module, but `catalog/admin.ts` (Phase 7) only ever got `generateVariantMatrix` (creates variants, no price) — no mutation existed to edit a variant's price/mrp/active flag after creation. Added:

- `updateVariantInputSchema` in `src/server/modules/catalog/admin-schemas.ts`
- `updateVariant()` in `src/server/modules/catalog/admin.ts`, mirroring `updateCategory`'s exact transaction + audit-log pattern

Also added `stockMovementsRelations` to `src/server/db/schema/relations.ts` (was missing — needed for the inventory movement-history page's `with: { adminUser: ... }` join). Purely additive; doesn't conflict with that file's documented one-`relations()`-call-per-table rule.

**Now verified against the real Supabase dev DB** (see "Dev-server smoke test" below) — sets a price override, writes the correct `audit_log` row, clears it back to `null`.

## What's built

All under `src/app/admin/`, typecheck + eslint + `next build` clean:

- **Shared shell** (`_components/`, `_lib/`): sidebar/topbar (`AdminShell`), `PageHeader`, `StatCard`, status badges, `DataTable`, `AdminPagination`, `ConfirmActionButton`, `useAdminAction` (client hook: Server Action call → pending state → toast), `action-result.ts` (`ActionResult<T>`), `admin-session.ts` (`getAdminSession()` guard), `money-client.ts`.
- **Login** (`login/`): email/password + TOTP 2FA sign-in, via `src/lib/auth-client.ts` (`better-auth/react` + `twoFactorClient`).
- **Dashboard** (`(dashboard)/page.tsx`): today/7d/30d orders + revenue, orders-needing-action list, low-stock list.
- **Products** (`(dashboard)/products/`): list + filters (status/category/search), create, edit (tabs: Details / Variants / Images), variant matrix generator, per-variant price/active edit dialog, real R2 direct-upload flow (browser resize-to-webp → `/api/admin/uploads/sign` → PUT → `/api/admin/uploads/commit`, reusing the existing Phase 7 routes rather than reimplementing as Server Actions, since the browser has to PUT directly to R2 in between).
- **Categories** (`(dashboard)/categories/`): tree list, up/down reorder, active toggle, create/edit dialog.
- **Inventory** (`(dashboard)/inventory/`): per-variant grid, low-stock filter, adjust-with-required-reason dialog, per-variant movement-history subpage.
- **Orders** (`(dashboard)/orders/`): list + filters (status/date/search), detail page with status-transition buttons (processing → ship-with-courier → delivered), full/partial refund dialog, cancel-with-refund-and-restock confirm, internal note, printable invoice (chrome hidden via `print:hidden`, not a separate route/layout).
- **Customers** (`(dashboard)/customers/`): list + search, detail (addresses, recent orders), disable/enable.
- **Coupons** (`(dashboard)/coupons/`): CRUD (type/value locked after creation, matching the backend's own design choice).
- **Settings** (`(dashboard)/settings/`): shipping fee/threshold form, store info form (GSTIN left optional/blank per docs/11 §29 #3).

## Dev-server smoke test (HTTP-level, real Supabase dev DB) — done, all clean now

- **`next dev` failed to boot at first**: `@next/swc-linux-x64-gnu` was missing from `node_modules` (lockfile has it correctly, just hadn't been fetched — this repo's history has Windows roots per other docs comments). Fixed with a plain `npm install`.
- **The one real bug worth flagging: `DataTable`'s original API couldn't actually work.** It took `columns: {header, cell: (row) => ReactNode}[]` computed in Server Component pages, then handed those functions to a `"use client"` component — functions can't cross that boundary (React throws "Functions cannot be passed directly to Client Components"). This didn't show up at typecheck or `next build` — it only throws when a table actually has rows. `/admin/orders`, `/admin/customers`, `/admin/coupons` all hit their empty-state branch in this DB (nothing seeded there yet), which masked it; `/admin/products` (20 seeded products) and `/admin/inventory` (192 seeded variants) both 500'd when actually hit. **Fixed by redesigning `DataTable`**: it now takes `headers: string[]` and `rows: {key, href?, cells: ReactNode[]}[]` — pages pre-render each cell as JSX (serializable) instead of passing render functions. Updated all 7 call sites. Re-verified via curl with a real signed-in admin session — every list and detail route now returns 200, including the two that were crashing.
- **How it was tested**: created a throwaway admin account via `scripts/create-admin.ts` (this repo's own sanctioned bootstrap script) against the real dev Supabase DB, signed in via curl using the Cloudflare Turnstile always-pass test secret already configured in `.env.local`, then hit every `/admin/*` route with the resulting session cookie. **Deleted that test account and its audit_log rows afterward** — DB is back to its prior state (0 admin accounts), nothing left behind.
- `next build` re-confirmed clean after the fix — same route shape (all `/admin/*` either `ƒ` Dynamic or `◐` Partial Prerender).

## Real browser check — found and fixed one more bug: login had no Turnstile widget

The owner opened `/admin/login` in an actual browser (screenshot) with a real admin account (`admin@admin.com`, created by the owner via `create-admin.ts`, not by me) and hit `"Missing CAPTCHA response"` on submit. Root cause: `login-form.tsx` called `authClient.signIn.email()` with no captcha token at all — the Turnstile *backend* (Better Auth's `captcha()` plugin, already configured pre-Phase-11) was live and correctly rejecting the request, but Phase 11 never actually rendered the Turnstile widget anywhere. My earlier curl-based smoke test hadn't caught this because I was manually forging the `x-captcha-response` header myself, which a browser obviously can't do.

Fixed:
- New `src/app/admin/login/turnstile-widget.tsx` — loads Cloudflare's script (`next/script`), explicit `window.turnstile.render()` (not the implicit `cf-turnstile` div + global callback pattern, to avoid name collisions and get a clean widget id to remove on unmount).
- `login-form.tsx` now renders it (only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set), blocks submit until a token exists, sends it as `fetchOptions: { headers: { "x-captcha-response": token } }` inside the single `authClient.signIn.email({...})` call (not a second positional arg — Better Auth's client puts `fetchOptions` inline in the same object, confirmed against the generated client types, not guessed), and forces the widget to remount (fresh token) after a failed sign-in, since Turnstile tokens are single-use.
- Owner confirmed in their browser afterward: **"it works now."** This is the one piece of this whole phase actually confirmed working by a real human in a real browser, not just curl/typecheck/build.
- Note for later: `/request-password-reset` (see below) is captcha-gated the same way — the new forgot-password UI will need this exact same widget, and it was built reusable for that (not login-specific).

## Docs updated: admin "Forgot password?" flow documented as a planned feature (not built)

At the owner's request, added a new section to `docs/07-images-and-admin.md` (right after Phase 7's Implementation notes) spelling out that the backend already fully supports this (Better Auth's `sendResetPassword` → real Resend email since Phase 8; `/request-password-reset` and `/reset-password` endpoints are live, Turnstile-gated and rate-limited already) and exactly what UI is missing: a "Forgot password?" link on the login form, a request-reset page, and a reset-password page, with the real client method signatures (`requestPasswordReset({email, redirectTo})`, `resetPassword({newPassword, token})`) confirmed against Better Auth's actual endpoint schemas. Not implemented — documentation only, per what was asked.

## Explicitly not done yet

- No commit made — CLAUDE.md requires showing the full commit message for approval before running `git commit`; that hasn't happened yet.
- The forgot-password UI itself (see above — intentionally deferred, documented only).
- Full visual/UX pass beyond the login page — only the login page has been eyeballed by a human so far; the other 7 modules are still only HTTP/curl-verified, not visually reviewed.

## Next steps

1. Draft a commit message (subject + bullets, no `Co-Authored-By`/`Generated-with` per this repo's CLAUDE.md) and get explicit go-ahead before committing.
2. Whenever the owner wants it: build the forgot-password flow per the new docs/07 section.
3. Delete this file once superseded by a proper `docs/07-images-and-admin.md` "Implementation notes (Phase 11)" section (matching how every other phase documents its real findings) — this file is a session-survival handoff note, not permanent documentation.

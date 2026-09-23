# Image Storage & Admin Panel

> Part of the India Kitsch plan. Index: [README.md](./README.md). Section numbers (§) are stable across files.

## 12. Image upload / storage architecture

- **Buckets:** `ik-images` (public via custom domain `img.<domain>`, never `r2.dev`) and `ik-backups` (private). Separate dev/staging buckets.
- **Why direct-to-R2 uploads:** Vercel functions have a small request-body limit (~4.5 MB _(verify)_) and we don't want image bytes through our function CPU. The browser uploads straight to R2 with a presigned URL.
- **Flow:**
  1. The admin UI resizes/compresses each image to WebP (max ~2000 px) **in the browser**.
  2. `POST /api/admin/uploads/sign` (`requireAdmin()`): validates productId, content-type allow-list (jpeg/png/webp) and declared size ≤ 5 MB; returns a **presigned PUT URL** (short expiry, content-type and content-length signed in) for a random key `products/{productId}/{ulid}.webp`, using S3-compatible credentials scoped to that bucket.
  3. The browser `PUT`s the file to R2 (bucket CORS allows PUT from the site origin only).
  4. `POST /api/admin/uploads/commit` (`requireAdmin()`): server `HEAD`s the object (size/type), range-reads the first bytes to **verify magic bytes**, then inserts the `product_images` row with alt text (required), dimensions and sort order. Objects that fail verification are deleted.
  5. A weekly sweep (`/api/cron/sweep`) deletes objects with no DB row older than 24 h.
- **Serving:** immutable `Cache-Control` (keys are never reused), CDN-cached at `img.<domain>`; custom `next/image` loader (§15).
- **Deletion:** soft-delete rows; purge R2 objects after 30 days (R2 has no per-object recovery, so this is the safety net).

## 13. Admin panel architecture

Route group `/admin` with its own layout, `noindex`, **`requireAdmin()` in every page/action/handler**, server-side pagination, Server Actions + Zod, and an `audit_log` entry per mutation.

| Module     | Scope (v1)                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard  | today/7d/30d orders and revenue, orders needing action (paid → processing), low-stock list. SQL aggregates cached ~60 s                                                                                                |
| Products   | list/search/filter; create/edit; **variant matrix generator** (sizes × colors → SKUs); per-variant price/stock; image upload + reorder + alt text; draft/active/archived (never hard-delete products that have orders) |
| Categories | tree (1 level), order, active toggle, image                                                                                                                                                                            |
| Inventory  | per-variant grid, inline adjust with reason, movement history                                                                                                                                                          |
| Orders     | filters by status/date/search; detail; transition buttons; add courier + tracking; refund (full/partial); internal note; printable packing slip / invoice (print-CSS HTML)                                             |
| Customers  | list, detail (addresses, orders), disable account                                                                                                                                                                      |
| Coupons    | CRUD: type, value, min subtotal, max discount, dates, global and per-user limits                                                                                                                                       |
| Settings   | shipping fee/threshold, GSTIN/seller state, contact details                                                                                                                                                            |

Stack: shadcn/ui, TanStack Table (server-driven), react-hook-form + Zod. Admin-only heavy libraries are code-split so they don't add to storefront bundles. Admin pages are never cached.

## Implementation notes (Phase 7 — backend only, no `/admin` pages yet; built and verified against real Postgres + the real R2 dev bucket, per docs/09 §20)

- **Every admin mutation function returns `{ result, revalidateTags }`, never calls `revalidateTag` itself.** `revalidateTag` only works inside a real Next.js request context, not in a plain test or script — `server/modules/admin/types.ts`'s `AdminMutationResult<T>` is the shared shape; the eventual Phase 11 Server Action is what actually calls `revalidateTag(...)` with the tags returned.
- **`server/modules/admin/audit.ts`'s `writeAuditLog` always runs inside the same transaction as the mutation it records** — verified for every domain (categories, products, variants, images, inventory, coupons, customers, orders, settings) rather than assumed.
- **A new `db/schema/relations.ts` was needed for the customer/order admin views** (`user` ↔ `addresses`/`orders`, `orders` ↔ `items`/`payments`/`events`/`refunds`, `coupons` ↔ `redemptions`) — `auth.ts` and `commerce.ts` each need relations pointing at the other, and defining `relations(user, ...)` directly in commerce.ts (which already imports `user`) would need auth.ts to import back, a real circular module dependency. One central file avoids it. Confirmed the hard way that Drizzle does **not** merge two separate `relations()` calls for the same table across files — a second one for `productVariants` silently replaced catalog.ts's existing relations instead of adding to them, breaking `cart/quote.ts`'s typing until reverted to a one-directional `inventory -> variant` relation instead.
- **Inventory admin (`inventory/admin.ts`'s `adjustStock`)** mirrors `on_hand + delta >= reserved` in its `WHERE` clause, which covers both CHECK constraints (`on_hand >= 0`, `reserved <= on_hand`) in one condition, since `reserved` is itself always `>= 0`.
- **Orders admin adds the `paid`/`processing -> cancelled` path Phase 6 deliberately deferred** (`orders/admin.ts`'s `cancelPaidOrder`): always a full refund of whatever's unrefunded, plus `inventory/service.ts`'s new `returnSoldStock` (the inverse of `sellReservedStock` — only `onHand` moves, since `reserved` was already cleared at sale time). `refundOrder` is the separate, more general action for "any paid state -> refunded," handling both a partial refund (status unchanged, `refundedPaise` grows) and a full one (transitions to `refunded`).
- **`store_settings.gstin` is deliberately left optional with no placeholder to replace** — docs/11 §29 #3 confirms the business isn't GST-registered, so a blank GSTIN is the actually-correct value, not a TBD.
- **A real environment limitation, not a code bug:** this sandbox's system clock is set to a fictional future date. Cloudflare R2 rejects presigned URLs signed against it with `ExpiredRequest` (confirmed: a live AWS SDK call that signs-and-sends in one step succeeds against the real bucket; a presigned URL's signature, fixed at generation time and checked by R2 against its own real clock, always fails here regardless of how quickly it's used afterward). `media/uploads.ts`'s `signProductImageUpload` calls `getSignedUrl` exactly as Phase 0's already-approved spike (`scripts/phase0-r2-check.ts`) does — this is not expected to be a problem on Vercel's real clock. `tests/integration/media-uploads.test.ts` works around it by uploading via a direct `PutObjectCommand` instead of actually fetching the presigned URL, so `commitProductImageUpload`'s real server-side verification (HEAD, magic bytes, delete-on-failure) is still exercised for real against the real bucket — but **the presigned-URL hop itself has not been verified end-to-end in this environment** and should get a real manual check (e.g. from a browser, or from a machine with a correct clock) before launch.
- **Still open (Phase 7 didn't build):** the weekly orphan-image sweep (`/api/cron/sweep`, docs/07 §12 step 5) and webhook-event pruning — both were explicitly out of this phase's roadmap scope; `/admin` pages themselves (Phase 11); printable packing slip/invoice HTML (Phase 8, alongside the other email/document templates); the dashboard's cached SQL aggregates.

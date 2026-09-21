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

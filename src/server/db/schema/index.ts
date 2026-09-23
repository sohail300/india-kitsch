/**
 * Barrel re-export of every schema file, so `db/client.ts` can do
 * `import * as schema from "./schema"` and get full relational-query
 * support (`db.query.products.findMany({ with: { variants: true } })`
 * etc.) across every table. See docs/02 §3 and docs/03 §4.
 */
export * from "./_shared";
export * from "./auth";
export * from "./catalog";
export * from "./commerce";
export * from "./inventory";
export * from "./misc";

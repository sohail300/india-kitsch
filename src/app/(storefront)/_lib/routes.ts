// Storefront pages that exist so far. Links to anything else (product,
// category, account, cart) render inactive until those pages are built.
export const LOCAL_ROUTES = new Set([
  "/",
  "/shop",
  "/search",
  "/wishlist",
  "/blog",
  "/about",
  "/faq",
  "/contact",
  "/policies/shipping-policy",
  "/policies/refund-policy",
  "/policies/privacy-policy",
  "/policies/terms-of-service",
]);

export type LinkKind = "local" | "external" | "inactive";

export function routePath(href: string): string {
  return href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
}

export function linkKind(href: string | null | undefined): LinkKind {
  if (!href || href === "#") return "inactive";
  if (/^(mailto:|tel:)/i.test(href)) return "external";
  if (/^https?:\/\//i.test(href)) return "external";
  return LOCAL_ROUTES.has(routePath(href)) ? "local" : "inactive";
}

export const localHref = (href: string) => href || "/";

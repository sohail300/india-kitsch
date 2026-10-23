"use client";

// Wishlist stored in localStorage (item shape mirrors the Sansevieria store's
// sv-wishlist.js). Moves to the backend once customer accounts exist.
import { useSyncExternalStore } from "react";
import { srcOf, type Product } from "./content";

export const STORAGE_KEY = "ikWishlist:v1";
const MAX_ITEMS = 100;
const EVENT = "ik-wishlist-change";

export type WishlistItem = {
  productId: string;
  variantId: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  productUrl: string;
  imageUrl: string;
  priceCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

const EMPTY: WishlistItem[] = [];
let cachedRaw: string | null = null;
let cachedItems: WishlistItem[] = EMPTY;

function read(): WishlistItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    cachedItems = Array.isArray(parsed)
      ? parsed.filter((i) => i && i.productId && i.variantId).slice(0, MAX_ITEMS)
      : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}

function write(items: WishlistItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage unavailable (private mode, quota) - the UI just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWishlist() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { items, ready };
}

export function isSaved(items: WishlistItem[], product: Product) {
  return items.some((i) => i.productId === product.productId);
}

export function toggleWishlist(product: Product) {
  if (!product.productId || !product.variantId) return;
  const items = read();
  if (items.some((i) => i.productId === product.productId)) {
    write(items.filter((i) => i.productId !== product.productId));
    return;
  }
  const now = new Date().toISOString();
  write([
    {
      productId: product.productId,
      variantId: product.variantId,
      productHandle: product.handle,
      productTitle: product.fullTitle ?? product.title,
      variantTitle: product.variantTitle ?? "",
      productUrl: product.url,
      imageUrl: product.images[0] ? srcOf(product.images[0].src) : "",
      priceCents: product.priceCents ?? 0,
      currency: "INR",
      createdAt: now,
      updatedAt: now,
    },
    ...items,
  ]);
}

export function removeFromWishlist(productId: string) {
  write(read().filter((i) => i.productId !== productId));
}

export function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

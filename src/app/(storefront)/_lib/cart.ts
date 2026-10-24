"use client";

// Client-side bag, per docs/05 §8: localStorage holds only {variantId, qty},
// never prices. The drawer resolves display details from the catalog; once the
// backend is wired in, quoteCart(lines) becomes the source of truth for them.
import { useSyncExternalStore } from "react";

export const CART_KEY = "ikCart:v1";
const CHANGE_EVENT = "ik-cart-change";
const MAX_QTY = 10;

export type CartLine = { variantId: string; qty: number };

const EMPTY: CartLine[] = [];
let cachedRaw: string | null = null;
let cachedLines: CartLine[] = EMPTY;

function readLines(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CART_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedLines;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    cachedLines = Array.isArray(parsed)
      ? parsed.filter((l) => l && typeof l.variantId === "string" && Number(l.qty) > 0)
      : EMPTY;
  } catch {
    cachedLines = EMPTY;
  }
  return cachedLines;
}

function writeLines(lines: CartLine[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    // Storage unavailable (private mode, quota): the bag just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeLines(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === CART_KEY && onChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCartLines() {
  return useSyncExternalStore(subscribeLines, readLines, () => EMPTY);
}

export function addToCart(variantId: string, qty = 1) {
  const lines = readLines();
  const existing = lines.find((l) => l.variantId === variantId);
  writeLines(
    existing
      ? lines.map((l) =>
          l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l,
        )
      : [...lines, { variantId, qty }],
  );
}

export function setLineQty(variantId: string, qty: number) {
  const lines = readLines();
  writeLines(
    qty <= 0
      ? lines.filter((l) => l.variantId !== variantId)
      : lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
  );
}

// Open/closed state of the bag drawer, shared by the header and quick-add buttons.
let drawerOpen = false;
const drawerListeners = new Set<() => void>();

function setDrawerOpen(open: boolean) {
  drawerOpen = open;
  drawerListeners.forEach((l) => l());
}

export const openCart = () => setDrawerOpen(true);
export const closeCart = () => setDrawerOpen(false);

export function useCartOpen() {
  return useSyncExternalStore(
    (onChange) => {
      drawerListeners.add(onChange);
      return () => drawerListeners.delete(onChange);
    },
    () => drawerOpen,
    () => false,
  );
}

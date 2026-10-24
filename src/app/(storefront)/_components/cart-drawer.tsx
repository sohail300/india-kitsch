"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { getProductByVariant } from "@/app/(storefront)/_lib/content";
import { closeCart, setLineQty, useCartLines, useCartOpen } from "@/app/(storefront)/_lib/cart";
import { formatPrice } from "@/app/(storefront)/_lib/wishlist";
import SiteLink from "./site-link";
import styles from "./cart-drawer.module.css";

// "Your Bag" slide-over, opened from the header bag button and quick-add buttons.
export default function CartDrawer() {
  const open = useCartOpen();
  const lines = useCartLines();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCart();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const items = lines.flatMap((line) => {
    const product = getProductByVariant(line.variantId);
    return product ? [{ line, product }] : [];
  });
  const count = items.reduce((n, { line }) => n + line.qty, 0);
  const subtotal = items.reduce(
    (sum, { line, product }) => sum + line.qty * (product.priceCents ?? 0),
    0,
  );

  return (
    <div className={styles.drawer} data-open={open || undefined} aria-hidden={!open}>
      <button
        type="button"
        className={styles.overlay}
        aria-label="Close bag"
        tabIndex={-1}
        onClick={closeCart}
      />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        inert={!open}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>
            Your Bag{" "}
            <span className={styles.count}>{count === 1 ? "1 item" : `${count} items`}</span>
          </h2>
          <button
            type="button"
            ref={closeRef}
            className={styles.close}
            aria-label="Close bag"
            onClick={closeCart}
          >
            ×
          </button>
        </header>

        <div className={styles.scroll}>
          {items.length === 0 ? (
            <div className={styles.empty}>
              <h3>Your bag is empty</h3>
              <p>Choose a piece you love and it will appear here.</p>
              <SiteLink href="/shop" className={styles.shop} onClick={closeCart}>
                Continue shopping
              </SiteLink>
            </div>
          ) : (
            <ul className={styles.lines}>
              {items.map(({ line, product }) => {
                const image = product.images[0];
                const name = product.fullTitle ?? product.title;
                return (
                  <li key={line.variantId} className={styles.line}>
                    <SiteLink href={product.url} className={styles.lineMedia} tabIndex={-1}>
                      {image && (
                        <Image
                          src={image.src}
                          alt={image.alt}
                          fill
                          sizes="88px"
                          className={styles.lineImage}
                        />
                      )}
                    </SiteLink>
                    <div className={styles.lineBody}>
                      <SiteLink href={product.url} className={styles.lineTitle}>
                        {name}
                      </SiteLink>
                      {product.variantTitle && (
                        <p className={styles.lineVariant}>{product.variantTitle}</p>
                      )}
                      <p className={styles.linePrice}>
                        {formatPrice((product.priceCents ?? 0) * line.qty)}
                      </p>
                      <div className={styles.lineActions}>
                        <div
                          className={styles.stepper}
                          role="group"
                          aria-label={`Quantity for ${name}`}
                        >
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setLineQty(line.variantId, line.qty - 1)}
                          >
                            −
                          </button>
                          <span aria-live="polite">{line.qty}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => setLineQty(line.variantId, line.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => setLineQty(line.variantId, 0)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <footer className={styles.footer}>
            <div className={styles.subtotal}>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <p className={styles.note}>Shipping and taxes calculated at checkout.</p>
            {/* Inactive until the checkout page exists (Phase 10). */}
            <SiteLink href="/checkout" className={styles.checkout}>
              Checkout
            </SiteLink>
          </footer>
        )}
      </aside>
    </div>
  );
}

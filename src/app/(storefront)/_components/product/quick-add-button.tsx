"use client";

import { addToCart, openCart } from "@/app/(storefront)/_lib/cart";
import { BagIcon } from "../icons";
import styles from "./product-card.module.css";

export default function QuickAddButton({
  variantId,
  title,
}: {
  variantId: string | null;
  title: string;
}) {
  return (
    <button
      type="button"
      className={styles.quickAddButton}
      aria-label={`Add ${title} to bag`}
      disabled={!variantId}
      onClick={(e) => {
        e.preventDefault();
        if (!variantId) return;
        addToCart(variantId);
        openCart();
      }}
    >
      <BagIcon size={18} />
    </button>
  );
}

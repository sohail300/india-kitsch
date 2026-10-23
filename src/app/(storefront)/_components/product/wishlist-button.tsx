"use client";

import type { Product } from "@/app/(storefront)/_lib/content";
import { isSaved, toggleWishlist, useWishlist } from "@/app/(storefront)/_lib/wishlist";
import { HeartIcon } from "../icons";
import styles from "./product-card.module.css";

export default function WishlistButton({ product }: { product: Product }) {
  const { items } = useWishlist();
  const saved = isSaved(items, product);
  const name = product.fullTitle ?? product.title;
  return (
    <button
      type="button"
      className={styles.wishlist}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      data-saved={saved || undefined}
      onClick={(e) => {
        e.preventDefault();
        toggleWishlist(product);
      }}
    >
      <HeartIcon size={17} filled={saved} />
    </button>
  );
}

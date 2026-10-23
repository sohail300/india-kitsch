import type { Product } from "@/app/(storefront)/_lib/content";
import SiteLink from "../site-link";
import { BagIcon } from "../icons";
import ProductGallery from "./product-gallery";
import WishlistButton from "./wishlist-button";
import styles from "./product-card.module.css";

export type CardVariant = "grid" | "edit" | "split" | "signature";

type Props = {
  product: Product;
  variant?: CardVariant;
  sizes?: string;
  preload?: boolean;
  zoomOut?: boolean;
};

const DEFAULT_SIZES = "(max-width: 749px) 50vw, (max-width: 1199px) 33vw, 20vw";

export default function ProductCard({
  product,
  variant = "grid",
  sizes = DEFAULT_SIZES,
  preload,
  zoomOut,
}: Props) {
  const title = product.title || product.fullTitle || "";
  return (
    <article className={styles.card} data-variant={variant} data-zoom-out={zoomOut || undefined}>
      <div className={styles.media}>
        <div className={styles.gallery}>
          {product.badge && <span className={styles.badge}>{product.badge}</span>}
          <SiteLink
            href={product.url}
            className={styles.mediaLink}
            aria-label={product.fullTitle ?? title}
            tabIndex={-1}
          >
            <ProductGallery
              images={product.images}
              title={product.fullTitle ?? title}
              sizes={sizes}
              controls={variant === "grid" || variant === "edit" ? "arrows" : "pills"}
              preload={preload}
            />
          </SiteLink>
          {variant === "grid" && (
            <span className={styles.quickAdd}>
              <button
                type="button"
                className={styles.quickAddButton}
                aria-label="Add to cart"
                aria-disabled="true"
              >
                <BagIcon size={18} />
              </button>
            </span>
          )}
        </div>
        <WishlistButton product={product} />
      </div>

      {zoomOut ? (
        <div className={styles.zoomOutTitle}>{product.fullTitle ?? title}</div>
      ) : (
        <div className={styles.content}>
          {product.label && <span className={styles.label}>{product.label}</span>}
          <h3 className={styles.title}>
            <SiteLink href={product.url}>{title}</SiteLink>
          </h3>
          <div className={styles.priceRow}>
            <span className={styles.price}>{product.price}</span>
            {product.compareAtPrice && <s className={styles.compare}>{product.compareAtPrice}</s>}
          </div>
          {product.soldOut ? (
            <span className={styles.lowStock}>Sold out</span>
          ) : (
            product.lowStock && (
              <span className={styles.lowStock}>
                <span className={styles.lowStockDot} />
                {product.lowStock}
              </span>
            )
          )}
        </div>
      )}
    </article>
  );
}

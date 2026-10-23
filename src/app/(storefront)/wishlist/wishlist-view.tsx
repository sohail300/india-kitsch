"use client";

import Link from "next/link";
import RichText from "@/app/(storefront)/_components/rich-text";
import SiteLink from "@/app/(storefront)/_components/site-link";
import { ArrowRight, CloseIcon, HeartIcon, LockIcon } from "@/app/(storefront)/_components/icons";
import { formatPrice, removeFromWishlist, useWishlist } from "@/app/(storefront)/_lib/wishlist";
import styles from "./wishlist.module.css";

type Props = { eyebrow: string; title: string; introHtml: string; deviceNote: string };

export default function WishlistView({ eyebrow, title, introHtml, deviceNote }: Props) {
  const { items, ready } = useWishlist();
  const status = !ready
    ? "Loading your wishlist…"
    : items.length
      ? `${items.length} saved ${items.length === 1 ? "piece" : "pieces"}`
      : "No saved pieces";

  return (
    <section className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrowIcon}>
                <HeartIcon size={10} filled />
              </span>
              <p className={styles.eyebrow}>{eyebrow}</p>
            </div>
            <h1 className={styles.title}>{title}</h1>
            <RichText html={introHtml} className={`${styles.intro} rte`} />
          </div>
          <div className={styles.summary}>
            <span className={styles.summaryIcon}>{ready ? items.length : "–"}</span>
            <p className={styles.status}>{status}</p>
          </div>
        </header>

        <div className={styles.deviceNote}>
          <LockIcon size={14} />
          <p>{deviceNote}</p>
        </div>

        {!ready ? (
          <div className={styles.skeletonGrid} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <HeartIcon size={22} />
            </div>
            <p className={styles.emptyEyebrow}>Your edit starts here</p>
            <h2 className={styles.emptyTitle}>Nothing saved yet</h2>
            <p className={styles.emptyText}>
              Tap the heart on a piece you love and it will wait for you here.
            </p>
            <Link href="/shop" className={styles.emptyButton}>
              Explore the collection <ArrowRight />
            </Link>
          </div>
        ) : (
          <ul className={styles.grid}>
            {items.map((item) => (
              <li key={item.productId} className={styles.card}>
                <SiteLink
                  href={item.productUrl}
                  className={styles.cardMedia}
                  tabIndex={-1}
                  aria-label={item.productTitle}
                >
                  {item.imageUrl ? (
                    // Saved items may come from the live store, so the URL isn't always local.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.placeholder} />
                  )}
                </SiteLink>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${item.productTitle}`}
                  onClick={() => removeFromWishlist(item.productId)}
                >
                  <CloseIcon size={16} />
                </button>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>
                    <SiteLink href={item.productUrl}>{item.productTitle}</SiteLink>
                  </h3>
                  {item.variantTitle && <p className={styles.variant}>{item.variantTitle}</p>}
                  <p className={styles.price}>{formatPrice(item.priceCents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

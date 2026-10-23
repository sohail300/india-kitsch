import type { Metadata } from "next";
import CollectionView from "@/app/(storefront)/_components/collection/collection-view";
import { collection, getProducts } from "@/app/(storefront)/_lib/content";
import styles from "@/app/(storefront)/_components/collection/collection.module.css";

export const metadata: Metadata = {
  title: collection.meta.title,
  description: collection.meta.description,
};

export default function ShopAllPage() {
  return (
    <>
      <section className={styles.intro}>
        <div className={styles.introInner}>
          <div className={styles.ornament} aria-hidden="true">
            <span />
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 3 2.5 9M7 3l4.5 6M7 3v8"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
            </svg>
            <span />
          </div>
          <h1 className={styles.title}>{collection.title}</h1>
          <div className={styles.bottomLine} aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
        </div>
      </section>
      <CollectionView
        products={getProducts(collection.products)}
        sortOptions={collection.sortOptions}
        filterLabels={collection.filters}
      />
    </>
  );
}

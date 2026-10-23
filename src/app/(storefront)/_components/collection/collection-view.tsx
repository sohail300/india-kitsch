"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/app/(storefront)/_lib/content";
import ProductCard from "../product/product-card";
import { ChevronDown, CloseIcon, FilterIcon, GridIcon } from "../icons";
import styles from "./collection.module.css";

type SortOption = { value: string; label: string };
type Props = { products: Product[]; sortOptions: SortOption[]; filterLabels: string[] };

const priceOf = (p: Product) =>
  (p.priceCents ?? Number(p.price.replace(/[^\d.]/g, "")) * 100) / 100;

function sortProducts(list: Product[], sort: string) {
  const sorted = [...list];
  switch (sort) {
    case "price-ascending":
      return sorted.sort((a, b) => priceOf(a) - priceOf(b));
    case "price-descending":
      return sorted.sort((a, b) => priceOf(b) - priceOf(a));
    case "title-ascending":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "title-descending":
      return sorted.sort((a, b) => b.title.localeCompare(a.title));
    default:
      return list;
  }
}

export default function CollectionView({ products, sortOptions, filterLabels }: Props) {
  const options = useMemo(() => {
    const seen = new Set<string>();
    return sortOptions.filter((o) => !seen.has(o.value) && seen.add(o.value));
  }, [sortOptions]);
  const [availabilityLabel = "Availability", priceLabel = "Price"] = filterLabels.filter(
    (l) => !/sort/i.test(l),
  );

  const maxPrice = Math.ceil(Math.max(...products.map(priceOf), 0));
  const [inStock, setInStock] = useState(false);
  const [outOfStock, setOutOfStock] = useState(false);
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [sort, setSort] = useState(options[0]?.value ?? "manual");
  const [zoomOut, setZoomOut] = useState(false);
  const [mobileColumns, setMobileColumns] = useState<1 | 2>(2);
  const [openPanel, setOpenPanel] = useState<"availability" | "price" | "sort" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inStockCount = products.filter((p) => !p.soldOut).length;
  const outCount = products.length - inStockCount;

  const visible = useMemo(() => {
    const filtered = products.filter((p) => {
      if (inStock !== outOfStock && (inStock ? p.soldOut : !p.soldOut)) return false;
      const price = priceOf(p);
      if (minP && price < Number(minP)) return false;
      if (maxP && price > Number(maxP)) return false;
      return true;
    });
    return sortProducts(filtered, sort);
  }, [products, inStock, outOfStock, minP, maxP, sort]);

  const activeFilters = Number(inStock) + Number(outOfStock) + Number(Boolean(minP || maxP));
  const clearAll = () => {
    setInStock(false);
    setOutOfStock(false);
    setMinP("");
    setMaxP("");
  };
  const toggle = (panel: NonNullable<typeof openPanel>) =>
    setOpenPanel((cur) => (cur === panel ? null : panel));
  const itemsLabel = `${visible.length} ${visible.length === 1 ? "item" : "items"}`;

  const availabilityFields = (
    <div className={styles.checkList}>
      <label className={styles.check}>
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
        <span>In stock ({inStockCount})</span>
      </label>
      <label className={styles.check} data-disabled={outCount === 0 || undefined}>
        <input
          type="checkbox"
          checked={outOfStock}
          disabled={outCount === 0}
          onChange={(e) => setOutOfStock(e.target.checked)}
        />
        <span>Out of stock ({outCount})</span>
      </label>
    </div>
  );

  const priceFields = (
    <div className={styles.priceFields}>
      <label className={styles.priceField}>
        <span>₹</span>
        <input
          inputMode="numeric"
          placeholder="0"
          value={minP}
          onChange={(e) => setMinP(e.target.value.replace(/\D/g, ""))}
          aria-label="Minimum price"
        />
      </label>
      <span className={styles.priceTo}>to</span>
      <label className={styles.priceField}>
        <span>₹</span>
        <input
          inputMode="numeric"
          placeholder={String(maxPrice)}
          value={maxP}
          onChange={(e) => setMaxP(e.target.value.replace(/\D/g, ""))}
          aria-label="Maximum price"
        />
      </label>
    </div>
  );

  const sortFields = (
    <div className={styles.sortList} role="radiogroup" aria-label="Sort by">
      {options.map((o) => (
        <label
          key={o.value}
          className={styles.sortOption}
          data-active={sort === o.value || undefined}
        >
          <input
            type="radio"
            name="sort"
            value={o.value}
            checked={sort === o.value}
            onChange={() => setSort(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Desktop facets bar */}
      <div className={styles.facets} onMouseLeave={() => setOpenPanel(null)}>
        <div className={styles.facetGroup}>
          <button
            type="button"
            className={styles.facetButton}
            aria-expanded={openPanel === "availability"}
            onClick={() => toggle("availability")}
          >
            <span>{availabilityLabel}</span>
            <ChevronDown />
          </button>
          {openPanel === "availability" && (
            <div className={styles.facetPanel}>{availabilityFields}</div>
          )}
        </div>
        <div className={styles.facetGroup}>
          <button
            type="button"
            className={styles.facetButton}
            aria-expanded={openPanel === "price"}
            onClick={() => toggle("price")}
          >
            <span>{priceLabel}</span>
            <ChevronDown />
          </button>
          {openPanel === "price" && <div className={styles.facetPanel}>{priceFields}</div>}
        </div>
        {activeFilters > 0 && (
          <button type="button" className={styles.clearAll} onClick={clearAll}>
            Clear all
          </button>
        )}
        <span className={styles.count}>{itemsLabel}</span>
        <div className={styles.facetGroup}>
          <button
            type="button"
            className={styles.facetButton}
            aria-expanded={openPanel === "sort"}
            onClick={() => toggle("sort")}
          >
            <span>Sort</span>
            <ChevronDown />
          </button>
          {openPanel === "sort" && (
            <div className={`${styles.facetPanel} ${styles.facetPanelRight}`}>{sortFields}</div>
          )}
        </div>
        <div className={styles.columns} role="group" aria-label="Grid density">
          <button
            type="button"
            className={styles.columnPicker}
            aria-pressed={!zoomOut}
            aria-label="Default grid"
            onClick={() => setZoomOut(false)}
          >
            <GridIcon cells={2} />
          </button>
          <button
            type="button"
            className={styles.columnPicker}
            aria-pressed={zoomOut}
            aria-label="Compact grid"
            onClick={() => setZoomOut(true)}
          >
            <GridIcon cells={3} />
          </button>
        </div>
      </div>

      {/* Mobile toolbar */}
      <div className={styles.mobileBar}>
        <button type="button" className={styles.mobileFilter} onClick={() => setDrawerOpen(true)}>
          <FilterIcon />
          <span>Filter &amp; Sort</span>
          {activeFilters > 0 && <span className={styles.badge}>{activeFilters}</span>}
        </button>
        <div className={styles.columns} role="group" aria-label="Grid columns">
          <button
            type="button"
            className={styles.columnPicker}
            aria-pressed={mobileColumns === 1}
            aria-label="One column"
            onClick={() => setMobileColumns(1)}
          >
            <GridIcon cells={1} />
          </button>
          <button
            type="button"
            className={styles.columnPicker}
            aria-pressed={mobileColumns === 2}
            aria-label="Two columns"
            onClick={() => setMobileColumns(2)}
          >
            <GridIcon cells={2} />
          </button>
        </div>
      </div>

      <ul
        className={styles.grid}
        data-zoom-out={zoomOut || undefined}
        data-mobile-columns={mobileColumns}
      >
        {visible.map((p, i) => (
          <li key={p.handle}>
            <ProductCard product={p} zoomOut={zoomOut} preload={i < 5} />
          </li>
        ))}
      </ul>
      {visible.length === 0 && (
        <div className={styles.empty}>
          <p>No products match these filters.</p>
          <button type="button" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* Mobile filter drawer */}
      <div
        className={styles.drawerRoot}
        data-open={drawerOpen || undefined}
        aria-hidden={!drawerOpen}
      >
        <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} />
        <div
          className={styles.drawer}
          role="dialog"
          aria-modal="true"
          aria-label="Filter and sort"
          inert={!drawerOpen}
        >
          <div className={styles.drawerHeader}>
            <div>
              <p className={styles.drawerEyebrow}>Refine</p>
              <h2 className={styles.drawerTitle}>Filter &amp; Sort</h2>
            </div>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={() => setDrawerOpen(false)}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <div className={styles.drawerBody}>
            <details open className={styles.drawerSection}>
              <summary>{availabilityLabel}</summary>
              {availabilityFields}
            </details>
            <details open className={styles.drawerSection}>
              <summary>{priceLabel}</summary>
              {priceFields}
            </details>
            <details open className={styles.drawerSection}>
              <summary>Sort by</summary>
              {sortFields}
            </details>
          </div>
          <div className={styles.drawerActions}>
            <button type="button" className={styles.drawerClear} onClick={clearAll}>
              Clear all
            </button>
            <button
              type="button"
              className={styles.drawerApply}
              onClick={() => setDrawerOpen(false)}
            >
              View {visible.length} styles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

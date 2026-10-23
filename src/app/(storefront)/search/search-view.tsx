"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Product } from "@/app/(storefront)/_lib/content";
import ProductCard from "@/app/(storefront)/_components/product/product-card";
import { CloseIcon, SearchIcon } from "@/app/(storefront)/_components/icons";
import styles from "./search.module.css";

type Props = { heading: string; placeholder: string; products: Product[] };

const haystack = (p: Product) =>
  [p.title, p.fullTitle, p.label, p.variantTitle, p.badge, p.handle.replace(/-/g, " ")]
    .join(" ")
    .toLowerCase();

export default function SearchView({ heading, placeholder, products }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const [value, setValue] = useState(query);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return products;
    return products.filter((p) => {
      const text = haystack(p);
      return terms.every((t) => text.includes(t));
    });
  }, [products, query]);

  const submit = (q: string) =>
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{query ? `Results for “${query}”` : heading}</h1>
        <form
          className={styles.form}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit(value.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="search-input">
            Search
          </label>
          <span className={styles.icon}>
            <SearchIcon size={22} />
          </span>
          <input
            id="search-input"
            className={styles.input}
            type="search"
            name="q"
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
          />
          {value && (
            <button
              type="button"
              className={styles.reset}
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                submit("");
              }}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </form>
        {query && (
          <p className={styles.count}>
            {results.length} {results.length === 1 ? "result" : "results"}
          </p>
        )}
      </div>
      {results.length > 0 ? (
        <ul className={styles.grid}>
          {results.map((p, i) => (
            <li key={p.handle}>
              <ProductCard product={p} preload={i < 5} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No results found. Try a different search term.</p>
      )}
    </div>
  );
}

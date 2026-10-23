import type { Metadata } from "next";
import { Suspense } from "react";
import { getProducts, search } from "@/app/(storefront)/_lib/content";
import SearchView from "./search-view";

export const metadata: Metadata = {
  title: search.meta.title,
  description: search.meta.description,
};

export default function SearchPage() {
  return (
    <Suspense>
      <SearchView
        heading={search.heading}
        placeholder={search.placeholder}
        products={getProducts(search.products)}
      />
    </Suspense>
  );
}

import type { DataTableSortLink } from "@/app/admin/_components/data-table";

export type SortDir = "asc" | "desc";

/**
 * Reads `?sort=&dir=` against a page's fixed list of sortable columns
 * (`firstDirs`: each key's starting direction). Anything unknown falls back
 * to the default, so the URL can't choose an arbitrary column.
 */
export function parseSort<K extends string>(
  firstDirs: Record<K, SortDir>,
  defaultKey: K,
  rawSort: string | undefined,
  rawDir: string | undefined,
): { sort: K; dir: SortDir; isDefault: boolean } {
  const sort =
    rawSort !== undefined && Object.hasOwn(firstDirs, rawSort) ? (rawSort as K) : defaultKey;
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : firstDirs[sort];
  return { sort, dir, isDefault: sort === defaultKey && dir === firstDirs[defaultKey] };
}

/**
 * A header's link: clicking the sorted column flips it, another column
 * starts at its own first direction. `href` builds the URL (and should
 * drop `page`, so a new sort starts from page 1).
 */
export function sortLinkFor<K extends string>(
  key: K,
  current: { sort: K; dir: SortDir },
  firstDirs: Record<K, SortDir>,
  href: (sort: K, dir: SortDir) => string,
): DataTableSortLink {
  const active = key === current.sort;
  const nextDir: SortDir = active ? (current.dir === "asc" ? "desc" : "asc") : firstDirs[key];
  return { href: href(key, nextDir), direction: active ? current.dir : null };
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { InfoIcon, PlusIcon, SearchIcon, TagsIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { categories, products } from "@/server/db/schema";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { AdminPagination } from "@/app/admin/_components/admin-pagination";
import { DataTable } from "@/app/admin/_components/data-table";
import { SortableDataTable } from "@/app/admin/_components/sortable-data-table";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";
import { CategoryFormDialog } from "./category-form-dialog";
import { moveCategoryAction } from "./actions";
import {
  CategoryActiveSwitch,
  CategoryDeleteButton,
  CategoryEditButton,
} from "./category-row-actions";

export const metadata: Metadata = { title: "Categories — India Kitsch Admin" };

// "position" is the store order (what the storefront shows) — the default,
// and the only view rows can be dragged in. The others are column sorts.
const SORT_FIRST_DIRS = {
  position: "asc",
  name: "asc",
  slug: "asc",
  products: "desc",
} as const satisfies Record<string, SortDir>;
type SortKey = keyof typeof SORT_FIRST_DIRS;
const DEFAULT_SORT: SortKey = "position";
const SORT_LABELS: Record<SortKey, string> = {
  position: "store order",
  name: "Name",
  slug: "Slug",
  products: "Products",
};

const HEADERS = ["Name", "Slug", "Products", "Visible", ""];
const HEADER_CLASSES = [undefined, undefined, undefined, undefined, "text-right"];

export default async function CategoriesPage(props: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);
  const inStoreOrder = sort === "position";
  const isFiltered = q !== "";

  const where = q
    ? or(ilike(categories.name, `%${q}%`), ilike(categories.slug, `%${q}%`))
    : undefined;
  const productCount = count(products.id);
  // Validated to exactly asc/desc by parseSort before reaching SQL.
  const direction = sql.raw(dir === "asc" ? "asc" : "desc");
  const orderBy: SQL[] =
    sort === "position"
      ? [sql`${categories.sortOrder} asc`, sql`${categories.name} asc`]
      : sort === "name"
        ? [sql`${categories.name} ${direction}`]
        : sort === "slug"
          ? [sql`${categories.slug} ${direction}`]
          : [sql`${productCount} ${direction}`, sql`${categories.sortOrder} asc`];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        isActive: categories.isActive,
        productCount,
      })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .where(where)
      .groupBy(categories.id)
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(...orderBy, asc(categories.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(categories).where(where),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  // The default sort is left out of URLs to keep them clean.
  function buildHref(opts: { page?: number; sort: SortKey; dir: SortDir }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, opts.sort, opts.dir).isDefault) {
      params.set("sort", opts.sort);
      params.set("dir", opts.dir);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/categories?${qs}` : "/admin/categories";
  }
  const makeHref = (nextPage: number) => buildHref({ page: nextPage, sort, dir });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));
  const sortLinks = [
    sortLink("name"),
    sortLink("slug"),
    sortLink("products"),
    undefined,
    undefined,
  ];

  const cellsFor = (category: (typeof rows)[number]): ReactNode[] => [
    <span key="name" className="font-medium text-foreground">
      {category.name}
    </span>,
    <span key="slug" className="text-muted-foreground">
      {category.slug}
    </span>,
    category.productCount > 0 ? (
      <Link
        key="products"
        href={`/admin/products?category=${category.id}`}
        className="tabular-nums underline-offset-4 hover:text-primary hover:underline"
      >
        {category.productCount}
      </Link>
    ) : (
      <span key="products" className="text-muted-foreground tabular-nums">
        0
      </span>
    ),
    <CategoryActiveSwitch
      key="visible"
      id={category.id}
      name={category.name}
      productCount={category.productCount}
      isActive={category.isActive}
    />,
    <div key="actions" className="flex justify-end gap-1">
      <CategoryEditButton category={category} />
      <CategoryDeleteButton
        id={category.id}
        name={category.name}
        productCount={category.productCount}
      />
    </div>,
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Drag rows by the handle to set the order shown on the storefront. Hiding a category also hides its products."
        actions={
          <CategoryFormDialog
            trigger={
              <Button>
                <PlusIcon /> New category
              </Button>
            }
          />
        }
      />

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        action="/admin/categories"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or slug…"
            className="w-full pl-9"
          />
        </div>
        {isDefaultSort ? null : (
          <>
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
          </>
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="soft" className="flex-1 sm:flex-none">
            <SearchIcon /> Search
          </Button>
          {isFiltered || !isDefaultSort ? (
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              render={<Link href="/admin/categories" />}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchIcon}
            title="No categories match this search"
            description="Try a different name or slug."
          />
        ) : (
          <EmptyState
            icon={TagsIcon}
            title="No categories yet"
            description="Create your first category, e.g. Suits or Kurtas, to start adding products."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {inStoreOrder ? null : (
            <Alert role="note" className="bg-muted/50">
              <InfoIcon />
              <AlertDescription>
                Sorted by {SORT_LABELS[sort]}, so dragging is off.{" "}
                <Link
                  href={buildHref({ sort: DEFAULT_SORT, dir: SORT_FIRST_DIRS[DEFAULT_SORT] })}
                  className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Back to store order
                </Link>{" "}
                to reorder.
              </AlertDescription>
            </Alert>
          )}
          <div className="rounded-2xl ring-1 ring-border">
            {inStoreOrder ? (
              <SortableDataTable
                headers={HEADERS}
                headerClassNames={HEADER_CLASSES}
                sortLinks={sortLinks}
                rows={rows.map((c) => ({ id: c.id, label: c.name, cells: cellsFor(c) }))}
                reorderAction={moveCategoryAction}
              />
            ) : (
              <DataTable
                headers={HEADERS}
                headerClassNames={HEADER_CLASSES}
                sortLinks={sortLinks}
                rows={rows.map((c) => ({ key: c.id, cells: cellsFor(c) }))}
              />
            )}
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={ADMIN_PAGE_SIZE}
            makeHref={makeHref}
          />
        </div>
      )}
    </div>
  );
}

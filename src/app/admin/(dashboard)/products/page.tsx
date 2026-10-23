import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, exists, ilike, or, sql, type SQL } from "drizzle-orm";
import { ImageIcon, PackageIcon, PlusIcon, SearchIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { qualified } from "@/server/db/sql-helpers";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { mainPhotoKeySql } from "@/server/modules/inventory/selling";
import { getCatalogSettings } from "@/server/modules/settings/queries";
import { categories, inventory, products, productVariants } from "@/server/db/schema";
import { formatINR } from "@/server/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { AdminPagination } from "@/app/admin/_components/admin-pagination";
import { DataTable } from "@/app/admin/_components/data-table";
import { ProductStatusBadge } from "@/app/admin/_components/status-badge";
import { formatAdminDate } from "@/app/admin/_lib/format-date";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";

export const metadata: Metadata = { title: "Products - India Kitsch Admin" };

const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Live" },
  { value: "archived", label: "Archived" },
];

const SORT_FIRST_DIRS = {
  added: "desc",
  name: "asc",
  price: "asc",
  stock: "asc",
} as const satisfies Record<string, SortDir>;
type SortKey = keyof typeof SORT_FIRST_DIRS;
const DEFAULT_SORT: SortKey = "added";

// Per-product figures across its sizes & colours that are selling (not paused), computed
// in SQL so the list can sort and page on them. A product with no sizes yet
// falls back to its own price and has 0 stock.
const variantPrice = sql`coalesce(${productVariants.pricePaise}, ${qualified(products.pricePaise)})`;
const minPrice = sql<number>`coalesce((
  select min(${variantPrice}) from ${productVariants}
  where ${productVariants.productId} = ${qualified(products.id)} and ${productVariants.isActive}
), ${qualified(products.pricePaise)})`;
const maxPrice = sql<number>`coalesce((
  select max(${variantPrice}) from ${productVariants}
  where ${productVariants.productId} = ${qualified(products.id)} and ${productVariants.isActive}
), ${qualified(products.pricePaise)})`;
const available = sql`(${inventory.onHand} - ${inventory.reserved})`;
const stockTotal = sql<number>`(
  select coalesce(sum(${available}), 0)::int from ${inventory}
  inner join ${productVariants} on ${productVariants.id} = ${inventory.variantId}
  where ${productVariants.productId} = ${qualified(products.id)} and ${productVariants.isActive}
)`;
const variantCount = sql<number>`(
  select count(*)::int from ${productVariants}
  where ${productVariants.productId} = ${qualified(products.id)} and ${productVariants.isActive}
)`;
const lowCount = (threshold: number) => sql<number>`(
  select count(*)::int from ${inventory}
  inner join ${productVariants} on ${productVariants.id} = ${inventory.variantId}
  where ${productVariants.productId} = ${qualified(products.id)} and ${productVariants.isActive}
    and ${qualified(products.status)} <> 'archived'
    and ${available} <= ${threshold}
)`;

const SORT_EXPRESSIONS: Record<SortKey, SQL> = {
  added: sql`${products.createdAt}`,
  name: sql`${products.name}`,
  price: minPrice,
  stock: stockTotal,
};

export default async function ProductsPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const status = STATUS_OPTIONS.some((o) => o.value === searchParams.status)
    ? searchParams.status!
    : "all";
  const categoryId = searchParams.category ?? "all";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);
  const isFiltered = q !== "" || status !== "all" || categoryId !== "all";

  const [allCategories, { lowStockThreshold }] = await Promise.all([
    db.query.categories.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    getCatalogSettings(),
  ]);

  const conditions = [
    status !== "all" ? eq(products.status, status as "draft" | "active" | "archived") : undefined,
    categoryId !== "all" ? eq(products.categoryId, categoryId) : undefined,
    // Name, or any size & colour's SKU (a code off a label or invoice).
    q
      ? or(
          ilike(products.name, `%${q}%`),
          exists(
            db
              .select({ one: sql`1` })
              .from(productVariants)
              .where(
                and(
                  eq(productVariants.productId, products.id),
                  ilike(productVariants.sku, `%${q}%`),
                ),
              ),
          ),
        )
      : undefined,
  ].filter((c) => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  // Validated to exactly asc/desc by parseSort before reaching SQL.
  const direction = sql.raw(dir === "asc" ? "asc" : "desc");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        status: products.status,
        createdAt: products.createdAt,
        categoryName: categories.name,
        categoryVisible: categories.isActive,
        photoKey: mainPhotoKeySql,
        minPrice,
        maxPrice,
        stock: stockTotal,
        variants: variantCount,
        low: lowCount(lowStockThreshold),
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(sql`${SORT_EXPRESSIONS[sort]} ${direction}`, sql`${products.id} asc`)
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  // The default sort is left out of URLs to keep them clean.
  function buildHref(opts: { page?: number; sort: SortKey; dir: SortDir }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (categoryId !== "all") params.set("category", categoryId);
    if (!parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, opts.sort, opts.dir).isDefault) {
      params.set("sort", opts.sort);
      params.set("dir", opts.dir);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  }
  const makeHref = (nextPage: number) => buildHref({ page: nextPage, sort, dir });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));

  const tableRows = rows.map((p) => ({
    key: p.id,
    cells: [
      <div
        key="photo"
        className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted"
      >
        {p.photoKey && imageBaseUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${imageBaseUrl}/${p.photoKey}`}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" aria-label="No photo" />
        )}
      </div>,
      // Only the name opens the product — the rest of the row isn't a link.
      <Link
        key="name"
        href={`/admin/products/${p.id}`}
        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {p.name}
      </Link>,
      p.categoryVisible ? (
        p.categoryName
      ) : (
        <span key="category" className="inline-flex flex-wrap items-center gap-1.5">
          {p.categoryName}
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            hidden
          </span>
        </span>
      ),
      <span key="price" className="whitespace-nowrap tabular-nums">
        {p.minPrice === p.maxPrice
          ? formatINR(p.minPrice)
          : `${formatINR(p.minPrice)} – ${formatINR(p.maxPrice)}`}
      </span>,
      p.variants === 0 ? (
        <span key="stock" className="text-muted-foreground">
          No sizes yet
        </span>
      ) : (
        <Link
          key="stock"
          href={`/admin/inventory?product=${p.id}`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums underline-offset-4 hover:underline"
        >
          {p.stock <= 0 ? (
            <span className="font-medium text-destructive">Sold out</span>
          ) : (
            <span className="text-foreground">{p.stock}</span>
          )}
          {p.stock > 0 && p.low > 0 ? (
            <span className="text-xs text-destructive">{p.low} low</span>
          ) : null}
        </Link>
      ),
      // A Live product in a hidden category isn't actually on the store — say so.
      <span key="status" className="inline-flex flex-wrap items-center gap-1.5">
        <ProductStatusBadge status={p.status} />
        {p.status === "active" && !p.categoryVisible ? (
          <span className="text-xs text-muted-foreground">not on store</span>
        ) : null}
      </span>,
      <span key="added" className="whitespace-nowrap text-muted-foreground">
        {formatAdminDate(p.createdAt)}
      </span>,
    ],
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        actions={
          <Button render={<Link href="/admin/products/new" />}>
            <PlusIcon /> New product
          </Button>
        }
      />

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        action="/admin/products"
      >
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or SKU…"
            className="w-full pl-9"
          />
        </div>
        <div className="flex gap-3">
          <Select name="status" defaultValue={status} items={STATUS_OPTIONS}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            name="category"
            defaultValue={categoryId}
            items={[
              { value: "all", label: "All categories" },
              ...allCategories.map((c) => ({
                value: c.id,
                label: c.isActive ? c.name : `${c.name} (hidden)`,
              })),
            ]}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive ? null : <span className="text-muted-foreground"> (hidden)</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              render={<Link href="/admin/products" />}
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
            title="No products match these filters"
            description="Try a different name, SKU, status or category."
          />
        ) : (
          <EmptyState
            icon={PackageIcon}
            title="No products yet"
            description="Add your first product to start selling."
            action={
              <Button render={<Link href="/admin/products/new" />}>
                <PlusIcon /> Add your first product
              </Button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={["", "Name", "Category", "Price", "Stock", "Status", "Added"]}
              headerClassNames={[
                "w-14",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
              ]}
              sortLinks={[
                undefined,
                sortLink("name"),
                undefined,
                sortLink("price"),
                sortLink("stock"),
                undefined,
                sortLink("added"),
              ]}
              rows={tableRows}
            />
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

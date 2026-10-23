import type { Metadata } from "next";
import Link from "next/link";
import { BoxesIcon, FilterIcon, HistoryIcon, ImageIcon, SearchIcon } from "lucide-react";
import { and, eq, ilike, ne, not, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { inventory, productVariants, products } from "@/server/db/schema";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { isForSale, mainPhotoKeySql } from "@/server/modules/inventory/selling";
import { getCatalogSettings } from "@/server/modules/settings/queries";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { AdminPagination } from "@/app/admin/_components/admin-pagination";
import { DataTable } from "@/app/admin/_components/data-table";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";
import { AdjustStockDialog } from "./adjust-stock-dialog";

export const metadata: Metadata = { title: "Inventory - India Kitsch Admin" };

const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;

// "Selling" (the default) = what's actually for sale; paused sizes & colours
// and archived products are opt-in views, so they never pose as low stock.
const STATUS_OPTIONS = [
  { value: "selling", label: "Selling" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived products" },
  { value: "all", label: "All" },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];
const DEFAULT_STATUS: StatusFilter = "selling";

const STATUS_CONDITIONS: Record<StatusFilter, SQL | undefined> = {
  selling: isForSale,
  paused: and(not(productVariants.isActive), ne(products.status, "archived")),
  archived: eq(products.status, "archived"),
  all: undefined,
};

const SORT_FIRST_DIRS = {
  product: "asc",
  stock: "asc",
} as const satisfies Record<string, SortDir>;
type SortKey = keyof typeof SORT_FIRST_DIRS;
const DEFAULT_SORT: SortKey = "product";

const available = sql<number>`(${inventory.onHand} - ${inventory.reserved})`;
const SORT_EXPRESSIONS: Record<SortKey, SQL[]> = {
  product: [sql`${products.name}`, sql`${productVariants.sortOrder}`],
  stock: [available],
};

export default async function InventoryPage(props: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    low?: string;
    product?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const lowOnly = searchParams.low === "1";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const status: StatusFilter = STATUS_OPTIONS.some((o) => o.value === searchParams.status)
    ? (searchParams.status as StatusFilter)
    : DEFAULT_STATUS;
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);
  // Owner-set in Settings → Products & stock.
  const { lowStockThreshold } = await getCatalogSettings();
  // Set by a product's "Stock history in Inventory" link: just that product.
  const productFilter = searchParams.product
    ? await db.query.products.findFirst({
        where: eq(products.id, searchParams.product),
        columns: { id: true, name: true },
      })
    : undefined;
  const isFiltered = q !== "" || lowOnly || status !== DEFAULT_STATUS;

  // Search, filters, sort and paging all happen in Postgres, so a page only
  // ever loads its own rows.
  const conditions = [
    STATUS_CONDITIONS[status],
    q
      ? or(
          ilike(products.name, `%${q}%`),
          ilike(productVariants.sku, `%${q}%`),
          ilike(productVariants.color, `%${q}%`),
          ilike(productVariants.size, `%${q}%`),
        )
      : undefined,
    lowOnly ? sql`${available} <= ${lowStockThreshold}` : undefined,
    productFilter ? eq(productVariants.productId, productFilter.id) : undefined,
  ].filter((c) => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  // Validated to exactly asc/desc by parseSort before reaching SQL.
  const direction = sql.raw(dir === "asc" ? "asc" : "desc");

  const [pageRows, [{ count }]] = await Promise.all([
    db
      .select({
        variantId: inventory.variantId,
        onHand: inventory.onHand,
        reserved: inventory.reserved,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        colorHex: productVariants.colorHex,
        selling: productVariants.isActive,
        productId: products.id,
        productName: products.name,
        productStatus: products.status,
        photoKey: mainPhotoKeySql,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where)
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(
        ...SORT_EXPRESSIONS[sort].map((expr) => sql`${expr} ${direction}`),
        sql`${productVariants.id} asc`,
      )
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where),
  ]);
  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  function buildHref(
    opts: { page?: number; sort?: SortKey; dir?: SortDir; low?: boolean } = {},
  ): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (opts.low ?? lowOnly) params.set("low", "1");
    if (status !== DEFAULT_STATUS) params.set("status", status);
    if (productFilter) params.set("product", productFilter.id);
    const s = opts.sort ?? sort;
    const d = opts.dir ?? dir;
    if (!parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, s, d).isDefault) {
      params.set("sort", s);
      params.set("dir", d);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
  }
  const currentHref = buildHref({ page });
  const makeHref = (nextPage: number) => buildHref({ page: nextPage });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));

  const tableRows = pageRows.map((r) => {
    const inStock = r.onHand - r.reserved;
    const label = `${r.productName} (${r.size} / ${r.color})`;
    return {
      key: r.variantId,
      cells: [
        <div
          key="photo"
          className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted"
        >
          {r.photoKey && imageBaseUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${imageBaseUrl}/${r.photoKey}`}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" aria-label="No photo" />
          )}
        </div>,
        <div key="product" className="flex flex-col gap-0.5">
          <Link
            href={`/admin/products/${r.productId}`}
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            {r.productName}
          </Link>
          {!r.selling || r.productStatus === "archived" ? (
            <span className="text-xs text-muted-foreground">
              {r.productStatus === "archived" ? "Archived product" : "Paused"}
            </span>
          ) : null}
        </div>,
        <span key="variant" className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {r.size} ·
          {r.colorHex ? (
            <span
              className="inline-block size-3 rounded-full ring-1 ring-border"
              style={{ backgroundColor: r.colorHex }}
            />
          ) : null}
          {r.color}
        </span>,
        <div key="stock" className="flex flex-col gap-0.5 tabular-nums">
          <span
            className={
              inStock <= 0
                ? "font-medium text-destructive"
                : inStock <= lowStockThreshold
                  ? "font-medium text-destructive"
                  : "font-medium text-foreground"
            }
          >
            {inStock <= 0 ? "Sold out" : inStock}
          </span>
          <span className="text-xs text-muted-foreground">
            {r.onHand} in hand · {r.reserved} in checkout
          </span>
        </div>,
        <span key="sku" className="font-mono text-xs text-muted-foreground">
          {r.sku}
        </span>,
        <div key="actions" className="flex justify-end gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Stock history for ${label}`}
                  render={
                    <Link
                      href={`/admin/inventory/${r.variantId}?back=${encodeURIComponent(currentHref)}`}
                    />
                  }
                >
                  <HistoryIcon />
                </Button>
              }
            />
            <TooltipContent>Stock history</TooltipContent>
          </Tooltip>
          <AdjustStockDialog compact variantId={r.variantId} label={label} onHand={r.onHand} />
        </div>,
      ],
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="How many of each size & colour you have. Every change has a reason and is kept in its history."
      />

      {productFilter ? (
        <Alert role="note" className="bg-muted/50">
          <FilterIcon />
          <AlertDescription>
            Showing only{" "}
            <Link
              href={`/admin/products/${productFilter.id}`}
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {productFilter.name}
            </Link>
            .{" "}
            <Link
              href="/admin/inventory"
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Show all stock
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        action="/admin/inventory"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search product, SKU, size, colour…"
            className="w-full pl-9"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select name="status" defaultValue={status} items={[...STATUS_OPTIONS]}>
            <SelectTrigger className="w-full sm:w-44">
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
          <Button
            variant={lowOnly ? "default" : "outline"}
            render={<Link href={buildHref({ low: !lowOnly })} />}
            aria-pressed={lowOnly}
            className="w-full sm:w-auto"
          >
            Low stock ({lowStockThreshold} or less)
          </Button>
        </div>
        {lowOnly ? <input type="hidden" name="low" value="1" /> : null}
        {productFilter ? <input type="hidden" name="product" value={productFilter.id} /> : null}
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
              render={
                <Link
                  href={
                    productFilter
                      ? `/admin/inventory?product=${productFilter.id}`
                      : "/admin/inventory"
                  }
                />
              }
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {pageRows.length === 0 ? (
        isFiltered || productFilter ? (
          <EmptyState
            icon={SearchIcon}
            title="Nothing matches these filters"
            description="Try a different search or status, or turn off Low stock."
          />
        ) : (
          <EmptyState
            icon={BoxesIcon}
            title="No stock yet"
            description="Add sizes & colours to a product first — each one gets its own stock here."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={["", "Product", "Size / Colour", "In stock", "SKU", ""]}
              headerClassNames={["w-14", undefined, undefined, undefined, undefined, "text-right"]}
              headerHints={[
                undefined,
                undefined,
                undefined,
                <div key="in-stock" className="flex flex-col gap-2">
                  <p className="rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs">
                    In stock = In hand − In checkout
                    <br />
                    12 = 14 − 2
                  </p>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                    <li>
                      <span className="font-semibold text-foreground">In stock</span> — the amount
                      the website shows.
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">In hand</span> — every piece
                      you have.
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">In checkout</span> — held for
                      someone paying right now (up to 5 minutes). If they pay, it&apos;s sold. If
                      not, it goes back to{" "}
                      <span className="font-semibold text-foreground">In stock</span>.
                    </li>
                    <li>
                      Adjust stock changes{" "}
                      <span className="font-semibold text-foreground">In hand</span>.
                    </li>
                  </ul>
                </div>,
                undefined,
                undefined,
              ]}
              sortLinks={[
                undefined,
                sortLink("product"),
                undefined,
                sortLink("stock"),
                undefined,
                undefined,
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

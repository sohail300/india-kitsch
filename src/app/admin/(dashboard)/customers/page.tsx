import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon, UsersIcon } from "lucide-react";
import { formatINR } from "@/server/lib/money";
import { listCustomers } from "@/server/modules/customers/queries";
import { CUSTOMER_SORT_FIRST_DIRS, type CustomerSortKey } from "@/server/modules/customers/schemas";
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
import { BooleanBadge } from "@/app/admin/_components/status-badge";
import { DataTable } from "@/app/admin/_components/data-table";
import { formatAdminDate } from "@/app/admin/_lib/format-date";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";

export const metadata: Metadata = { title: "Customers - India Kitsch Admin" };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
];

const DEFAULT_SORT: CustomerSortKey = "joined";

export default async function CustomersPage(props: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const status =
    searchParams.status === "active" || searchParams.status === "disabled"
      ? searchParams.status
      : "all";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const isFiltered = q !== "" || status !== "all";
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(CUSTOMER_SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);

  const result = await listCustomers({
    q: q || undefined,
    status: status === "all" ? undefined : status,
    sort,
    dir,
    page,
  });

  // The default sort is left out of URLs to keep them clean.
  function buildHref(opts: { page?: number; sort: CustomerSortKey; dir: SortDir }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (!parseSort(CUSTOMER_SORT_FIRST_DIRS, DEFAULT_SORT, opts.sort, opts.dir).isDefault) {
      params.set("sort", opts.sort);
      params.set("dir", opts.dir);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/customers?${qs}` : "/admin/customers";
  }

  const makeHref = (nextPage: number) => buildHref({ page: nextPage, sort, dir });
  const sortLink = (key: CustomerSortKey) =>
    sortLinkFor(key, { sort, dir }, CUSTOMER_SORT_FIRST_DIRS, (s, d) =>
      buildHref({ sort: s, dir: d }),
    );

  const tableRows = result.items.map(
    ({ customer: c, orderCount, totalSpentPaise, lastOrderAt }) => ({
      key: c.id,
      cells: [
        // Only the name opens the customer - the rest of the row isn't a link.
        <Link
          key="name"
          href={`/admin/customers/${c.id}`}
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {c.name}
        </Link>,
        c.email,
        c.phone ?? (
          <span key="phone" className="text-muted-foreground">
            -
          </span>
        ),
        formatAdminDate(c.createdAt),
        orderCount,
        orderCount > 0 ? (
          formatINR(totalSpentPaise)
        ) : (
          <span key="spent" className="text-muted-foreground">
            -
          </span>
        ),
        lastOrderAt ? (
          formatAdminDate(lastOrderAt)
        ) : (
          <span key="last-order" className="text-muted-foreground">
            -
          </span>
        ),
        <BooleanBadge key="status" value={!c.disabled} trueLabel="Active" falseLabel="Disabled" />,
      ],
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" />

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        action="/admin/customers"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="w-full pl-9"
          />
        </div>
        <Select name="status" defaultValue={status} items={STATUS_OPTIONS}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          {isFiltered ? (
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              render={<Link href="/admin/customers" />}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {result.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchIcon}
            title="No customers match these filters"
            description="Try a different name, email or status."
          />
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="No customers yet"
            description="Customers appear here once they create an account."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={[
                "Name",
                "Email",
                "Phone",
                "Joined",
                "Orders",
                "Total spent",
                "Last order",
                "Status",
              ]}
              sortLinks={[
                sortLink("name"),
                sortLink("email"),
                undefined,
                sortLink("joined"),
                sortLink("orders"),
                sortLink("spent"),
                sortLink("last_order"),
                undefined,
              ]}
              rows={tableRows}
            />
          </div>
          <AdminPagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            pageSize={result.pageSize}
            makeHref={makeHref}
          />
        </div>
      )}
    </div>
  );
}

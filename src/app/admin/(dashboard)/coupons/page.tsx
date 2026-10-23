import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, eq, ilike, sql, type AnyColumn } from "drizzle-orm";
import { PencilIcon, PlusIcon, SearchIcon, TicketPercentIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { coupons, user } from "@/server/db/schema";
import { formatINR } from "@/server/lib/money";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { COUPON_STATUSES, couponStatusSql, isCouponStatus } from "@/server/modules/coupons/status";
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
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";
import { CouponStatusBadge } from "@/app/admin/_components/status-badge";
import { CouponActiveSwitch, CreateCouponDialog, EditCouponDialog } from "./coupon-form-dialogs";

export const metadata: Metadata = { title: "Coupons - India Kitsch Admin" };

type Coupon = typeof coupons.$inferSelect;

const STATUS_LABELS: Record<(typeof COUPON_STATUSES)[number], string> = {
  live: "Live",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  inactive: "Inactive",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...COUPON_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

// The only columns the URL can sort by, each with the direction it starts
// in when its header is first clicked.
const SORT_COLUMNS = {
  code: coupons.code,
  min_subtotal: coupons.minSubtotalPaise,
  max_discount: coupons.maxDiscountPaise,
  usage: coupons.usedCount,
  created: coupons.createdAt,
} satisfies Record<string, AnyColumn>;
type SortKey = keyof typeof SORT_COLUMNS;
const SORT_FIRST_DIRS: Record<SortKey, SortDir> = {
  code: "asc",
  min_subtotal: "desc",
  max_discount: "desc",
  usage: "desc",
  created: "desc",
};

function discountLabel(coupon: Coupon): string {
  return coupon.type === "percent"
    ? `${(coupon.valueBps ?? 0) / 100}% off`
    : `${formatINR(coupon.valuePaise ?? 0)} off`;
}

function usageLabel(coupon: Coupon): string {
  return `${coupon.usedCount}${coupon.maxUses ? ` / ${coupon.maxUses}` : ""}`;
}

function windowLabel(coupon: Coupon): ReactNode {
  if (!coupon.startsAt && !coupon.endsAt) {
    return <span className="text-xs text-muted-foreground">No limit</span>;
  }
  return (
    <span className="text-xs text-muted-foreground">
      {coupon.startsAt ? new Date(coupon.startsAt).toLocaleDateString() : "-"} →{" "}
      {coupon.endsAt ? new Date(coupon.endsAt).toLocaleDateString() : "-"}
    </span>
  );
}

function maxDiscountLabel(coupon: Coupon): ReactNode {
  return coupon.maxDiscountPaise !== null ? (
    formatINR(coupon.maxDiscountPaise)
  ) : (
    <span className="text-xs text-muted-foreground">No cap</span>
  );
}

export default async function CouponsPage(props: {
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
    searchParams.status && isCouponStatus(searchParams.status) ? searchParams.status : "all";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const isFiltered = q !== "" || status !== "all";
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, "created", searchParams.sort, searchParams.dir);

  const statusSql = couponStatusSql(new Date());
  const conditions = [
    q ? ilike(coupons.code, `%${q}%`) : undefined,
    status !== "all" ? eq(statusSql, status) : undefined,
  ].filter((c) => c !== undefined);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ coupon: coupons, status: statusSql, createdByEmail: user.email })
      .from(coupons)
      .leftJoin(user, eq(user.id, coupons.createdByAdminId))
      .where(where)
      // Empty values (a null max discount = "No cap") always sort last;
      // `id` breaks ties so equal values keep a stable order across pages.
      .orderBy(sql`${SORT_COLUMNS[sort]} ${sql.raw(dir)} nulls last`, asc(coupons.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(coupons)
      .where(where),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE));

  // The default sort is left out of URLs to keep them clean.
  function buildHref(opts: { page?: number; sort: SortKey; dir: SortDir }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (!parseSort(SORT_FIRST_DIRS, "created", opts.sort, opts.dir).isDefault) {
      params.set("sort", opts.sort);
      params.set("dir", opts.dir);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/coupons?${qs}` : "/admin/coupons";
  }

  const makeHref = (nextPage: number) => buildHref({ page: nextPage, sort, dir });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));

  const tableRows = rows.map(({ coupon: c, status: couponStatus, createdByEmail }) => ({
    key: c.id,
    cells: [
      <span key="code" className="font-mono font-medium text-foreground">
        {c.code}
      </span>,
      <CouponStatusBadge key="status" status={couponStatus} />,
      discountLabel(c),
      formatINR(c.minSubtotalPaise),
      maxDiscountLabel(c),
      usageLabel(c),
      windowLabel(c),
      <div key="created" className="whitespace-nowrap">
        <p className="text-foreground">{formatAdminDateTime(c.createdAt)}</p>
        {createdByEmail ? (
          <p className="text-xs text-muted-foreground">by {createdByEmail}</p>
        ) : null}
      </div>,
      <span key="active" data-stop-row-link>
        <CouponActiveSwitch id={c.id} code={c.code} isActive={c.isActive} />
      </span>,
      <span key="edit" data-stop-row-link>
        <EditCouponDialog
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.code}`}>
              <PencilIcon />
            </Button>
          }
          tooltip="Edit coupon"
          initial={c}
        />
      </span>,
    ],
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Coupons"
        actions={
          <CreateCouponDialog
            trigger={
              <Button>
                <PlusIcon /> New coupon
              </Button>
            }
          />
        }
      />

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        action="/admin/coupons"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search by code…" className="w-full pl-9" />
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
              render={<Link href="/admin/coupons" />}
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
            title="No coupons match these filters"
            description="Try a different code or status."
          />
        ) : (
          <EmptyState
            icon={TicketPercentIcon}
            title="No coupons yet"
            description="Create your first discount code."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={[
                "Code",
                "Status",
                "Discount",
                "Min subtotal",
                "Max discount",
                "Usage",
                "Window",
                "Created",
                "Active",
                "",
              ]}
              sortLinks={[
                sortLink("code"),
                undefined,
                undefined,
                sortLink("min_subtotal"),
                sortLink("max_discount"),
                sortLink("usage"),
                undefined,
                sortLink("created"),
                undefined,
                undefined,
              ]}
              headerClassNames={[
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                "text-right",
              ]}
              rows={tableRows}
            />
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={count}
            pageSize={ADMIN_PAGE_SIZE}
            makeHref={makeHref}
          />
        </div>
      )}
    </div>
  );
}

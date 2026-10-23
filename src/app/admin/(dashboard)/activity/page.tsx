import type { Metadata } from "next";
import Link from "next/link";
import { HistoryIcon, SearchIcon } from "lucide-react";
import {
  ACTIVITY_AREAS,
  listActivity,
  listActivityAdmins,
  resolveActivityItems,
  type ActivityArea,
} from "@/server/modules/admin/activity";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { DateRangeField } from "@/app/admin/_components/date-range-field";
import { getAdminSession } from "@/app/admin/_lib/admin-session";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { endOfStoreDay, startOfStoreDay } from "@/app/admin/_lib/store-time";
import { parseSort, sortLinkFor, type SortDir } from "@/app/admin/_lib/table-sort";
import { ActivityDetailsDialog } from "./activity-details-dialog";
import { actionLabel, describeChanges, summarizeEntry } from "./present";

export const metadata: Metadata = { title: "Activity log - India Kitsch Admin" };

const SORT_FIRST_DIRS = { date: "desc" } as const satisfies Record<string, SortDir>;
type SortKey = keyof typeof SORT_FIRST_DIRS;
const DEFAULT_SORT: SortKey = "date";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every admin change, newest first, read from `audit_log` (docs/07 §13).
 * View-only: entries can't be edited or deleted. Payments and the expiry
 * job aren't admin changes — those are on each order's timeline.
 */
export default async function ActivityPage(props: {
  searchParams: Promise<{
    area?: string;
    admin?: string;
    from?: string;
    to?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  // The layout already guards /admin; this page shows other admins' emails
  // and raw snapshots, so it checks again rather than rely on that alone.
  await getAdminSession();
  const searchParams = await props.searchParams;
  const area = ACTIVITY_AREAS.some((a) => a.value === searchParams.area)
    ? (searchParams.area as ActivityArea)
    : "all";
  // Store-calendar days (IST), not `new Date("yyyy-MM-dd")`, which is UTC midnight.
  const from = searchParams.from && DAY_PATTERN.test(searchParams.from) ? searchParams.from : "";
  const to = searchParams.to && DAY_PATTERN.test(searchParams.to) ? searchParams.to : "";
  const page = Math.max(1, Number(searchParams.page) || 1);
  const {
    sort,
    dir,
    isDefault: isDefaultSort,
  } = parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, searchParams.sort, searchParams.dir);

  const admins = await listActivityAdmins();
  const adminId = admins.some((a) => a.id === searchParams.admin) ? searchParams.admin! : "all";
  const isFiltered = from !== "" || to !== "" || area !== "all" || adminId !== "all";

  const { entries, total, areaCounts } = await listActivity({
    area,
    adminUserId: adminId === "all" ? undefined : adminId,
    from: from ? startOfStoreDay(from) : undefined,
    to: to ? endOfStoreDay(to) : undefined,
    dir,
    page,
  });
  const { items, categoryNames } = await resolveActivityItems(entries);
  const ctx = { categoryNames };
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  // The default sort is left out of URLs to keep them clean.
  function buildHref(
    opts: { page?: number; sort?: SortKey; dir?: SortDir; area?: string } = {},
  ): string {
    const params = new URLSearchParams();
    const a = opts.area ?? area;
    if (a !== "all") params.set("area", a);
    if (adminId !== "all") params.set("admin", adminId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const sk = opts.sort ?? sort;
    const d = opts.dir ?? dir;
    if (!parseSort(SORT_FIRST_DIRS, DEFAULT_SORT, sk, d).isDefault) {
      params.set("sort", sk);
      params.set("dir", d);
    }
    if (opts.page && opts.page > 1) params.set("page", String(opts.page));
    const qs = params.toString();
    return qs ? `/admin/activity?${qs}` : "/admin/activity";
  }
  const makeHref = (nextPage: number) => buildHref({ page: nextPage });
  const sortLink = (key: SortKey) =>
    sortLinkFor(key, { sort, dir }, SORT_FIRST_DIRS, (s, d) => buildHref({ sort: s, dir: d }));

  const tableRows = entries.map((e) => {
    const item = items.get(e.id)!;
    const label = actionLabel(e.action);
    const when = formatAdminDateTime(e.createdAt);
    const summary = summarizeEntry(e.action, e.entityType, e.before, e.after, ctx);
    const raw: Record<string, unknown> = {
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
    };
    if (e.before != null) raw.before = e.before;
    if (e.after != null) raw.after = e.after;

    return {
      key: e.id,
      cells: [
        <span key="when" className="whitespace-nowrap">
          {when}
        </span>,
        <span key="admin" className="whitespace-nowrap text-muted-foreground">
          {e.adminEmail}
        </span>,
        <span key="action" className="font-medium whitespace-nowrap">
          {label}
        </span>,
        <span key="item" className="flex flex-wrap items-center gap-1.5">
          {item.href ? (
            <Link
              href={item.href}
              className="text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
          {item.deleted ? (
            <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
              deleted
            </span>
          ) : null}
        </span>,
        summary ? (
          <span key="changes" className="text-muted-foreground">
            {summary}
          </span>
        ) : (
          <span key="changes" className="text-muted-foreground">
            —
          </span>
        ),
        <div key="details" className="flex justify-end">
          <ActivityDetailsDialog
            title={label}
            subtitle={`${item.label} · ${when} · by ${e.adminEmail}`}
            changes={describeChanges(e.entityType, e.before, e.after, ctx)}
            raw={JSON.stringify(raw, null, 2)}
          />
        </div>,
      ],
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity log"
        description="Every change made in the admin panel, by whom and when."
      />

      <nav aria-label="Area" className="-mb-2 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {ACTIVITY_AREAS.map((tab) => {
            const active = tab.value === area;
            return (
              <li key={tab.value}>
                <Link
                  href={buildHref({ area: tab.value })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-md px-1.5 text-xs tabular-nums",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {areaCounts[tab.value]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        action="/admin/activity"
      >
        {/* Only worth a filter once more than one admin has made changes. */}
        {admins.length > 1 ? (
          <Select
            name="admin"
            defaultValue={adminId}
            items={[
              { value: "all", label: "All admins" },
              ...admins.map((a) => ({ value: a.id, label: a.email })),
            ]}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All admins</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <DateRangeField defaultFrom={from} defaultTo={to} />
        {area !== "all" ? <input type="hidden" name="area" value={area} /> : null}
        {isDefaultSort ? null : (
          <>
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
          </>
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="soft" className="flex-1 sm:flex-none">
            <SearchIcon /> Filter
          </Button>
          {isFiltered || !isDefaultSort ? (
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              render={<Link href="/admin/activity" />}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {entries.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchIcon}
            title="No activity matches these filters"
            description="Try a different area, admin or date range."
          />
        ) : (
          <EmptyState
            icon={HistoryIcon}
            title="No activity yet"
            description="Changes made in the admin panel show up here."
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={["When", "Admin", "Action", "Item", "Changes", ""]}
              headerClassNames={[
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                "text-right",
              ]}
              sortLinks={[sortLink("date"), undefined, undefined, undefined, undefined, undefined]}
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

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/** Server-driven pagination (docs/07 §13) - plain links to `?page=n`, no client state. */
export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  makeHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        {total} {total === 1 ? "result" : "results"}
      </p>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={makeHref(Math.max(1, page - 1))}
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {pages.map((p, i) => (
            <PaginationItem key={p}>
              {i > 0 && p - pages[i - 1]! > 1 ? (
                <span className="px-2 text-sm text-muted-foreground">…</span>
              ) : null}
              <PaginationLink href={makeHref(p)} isActive={p === page}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href={makeHref(Math.min(totalPages, page + 1))}
              aria-disabled={page === totalPages}
              className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

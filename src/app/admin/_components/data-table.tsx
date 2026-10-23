"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface DataTableRow {
  key: string;
  href?: string;
  cells: ReactNode[];
}

/**
 * A sortable column's header link. `href` is precomputed by the (server)
 * caller for the same reason cells are pre-rendered: no functions across
 * the boundary. `direction` is set only on the column currently sorted.
 */
export interface DataTableSortLink {
  href: string;
  direction: "asc" | "desc" | null;
}

/** One header cell — a plain label, or a sort link with its direction icon. Shared with SortableDataTable. */
/**
 * An ⓘ button beside a column header that opens a short explanation on
 * hover — a popover rather than a plain tooltip, so a tap still opens it on
 * touch screens, and it can hold formatted content.
 */
function HeaderHint({ label, hint }: { label: string; hint: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        // Opens on hover (and keyboard focus); a tap still opens it on touch screens.
        openOnHover
        delay={100}
        render={
          <button
            type="button"
            aria-label={`What does "${label}" mean?`}
            className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 text-sm font-normal tracking-normal normal-case"
      >
        {hint}
      </PopoverContent>
    </Popover>
  );
}

export function DataTableHead({
  label,
  sort,
  hint,
  className,
}: {
  label: string;
  sort?: DataTableSortLink;
  /** Optional explanation behind an ⓘ button next to the label. */
  hint?: ReactNode;
  className?: string;
}) {
  const SortIcon =
    sort?.direction === "asc"
      ? ArrowUpIcon
      : sort?.direction === "desc"
        ? ArrowDownIcon
        : ChevronsUpDownIcon;
  return (
    <TableHead
      aria-sort={
        sort?.direction === "asc"
          ? "ascending"
          : sort?.direction === "desc"
            ? "descending"
            : undefined
      }
      className={cn("text-xs tracking-wide text-muted-foreground uppercase", className)}
    >
      <span className="inline-flex items-center gap-1">
        {sort ? (
          <Link
            href={sort.href}
            scroll={false}
            className={cn(
              "-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground",
              sort.direction && "text-foreground",
            )}
          >
            {label}
            <SortIcon className={cn("size-3.5", !sort.direction && "opacity-50")} aria-hidden />
          </Link>
        ) : (
          label
        )}
        {hint ? <HeaderHint label={label} hint={hint} /> : null}
      </span>
    </TableHead>
  );
}

/**
 * A plain table over shadcn's Table primitives, client-side only for the
 * row-click-to-navigate interaction. Column *headers* are static strings,
 * and row content is pre-rendered `ReactNode[]` computed by the caller (a
 * Server Component) - never a `cell: (row) => ReactNode` render function.
 * A function can't cross the Server->Client boundary as a prop (React
 * throws "Functions cannot be passed directly to Client Components"); an
 * already-rendered element tree can, same as any other `children`.
 */
export function DataTable({
  headers,
  headerClassNames,
  sortLinks,
  headerHints,
  rows,
  emptyMessage = "No results.",
}: {
  headers: string[];
  headerClassNames?: (string | undefined)[];
  /** Parallel to `headers`; a column with no entry isn't sortable. */
  sortLinks?: (DataTableSortLink | undefined)[];
  /** Parallel to `headers`; an entry adds an ⓘ explanation to that column. */
  headerHints?: (ReactNode | undefined)[];
  rows: DataTableRow[];
  emptyMessage?: string;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((header, i) => (
              <DataTableHead
                key={header || i}
                label={header}
                sort={sortLinks?.[i]}
                hint={headerHints?.[i]}
                className={headerClassNames?.[i]}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                className="h-32 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.key}
                className={row.href ? "cursor-pointer" : undefined}
                onClick={
                  row.href
                    ? (event) => {
                        if ((event.target as HTMLElement).closest("[data-stop-row-link]")) return;
                        router.push(row.href!);
                      }
                    : undefined
                }
              >
                {row.cells.map((cell, i) => (
                  <TableCell key={i}>{cell}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

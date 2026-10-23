import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { stockMovements } from "@/server/db/schema";
import { ADMIN_PAGE_SIZE } from "@/server/modules/admin/pagination";
import { Button } from "@/components/ui/button";
import { MetricStrip } from "@/app/admin/_components/metric-strip";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { AdminPagination } from "@/app/admin/_components/admin-pagination";
import { DataTable } from "@/app/admin/_components/data-table";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { AdjustStockDialog } from "../adjust-stock-dialog";

export const metadata: Metadata = { title: "Stock movements - India Kitsch Admin" };

// Same palette family as the dashboard's metric strip.
const IN_STOCK_COLOR = "oklch(0.5 0.14 155)";
const SOLD_OUT_COLOR = "oklch(0.5 0.19 25)";
const IN_HAND_COLOR = "oklch(0.5 0.15 250)";
const IN_CHECKOUT_COLOR = "oklch(0.58 0.13 70)";

const REASON_LABEL: Record<string, string> = {
  reserve: "Held for checkout",
  release: "Checkout not paid — released",
  sale: "Sold",
  return: "Returned",
  adjustment: "Manual adjustment",
  restock: "Restock",
};

export default async function VariantMovementsPage(props: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<{ page?: string; back?: string }>;
}) {
  const { variantId } = await props.params;
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page) || 1);
  // Return to the exact Inventory view (filters, sort, page) the owner came
  // from. Only same-site Inventory paths are accepted — never an open redirect.
  const backHref =
    searchParams.back?.startsWith("/admin/inventory") && !searchParams.back.startsWith("//")
      ? searchParams.back
      : "/admin/inventory";

  const variant = await db.query.productVariants.findFirst({
    where: (v, { eq: eqFn }) => eqFn(v.id, variantId),
    with: { product: true },
  });
  if (!variant) notFound();

  const inventoryRow = await db.query.inventory.findFirst({
    where: (inv, { eq: eqFn }) => eqFn(inv.variantId, variantId),
  });
  const inStock = (inventoryRow?.onHand ?? 0) - (inventoryRow?.reserved ?? 0);

  const [movements, [{ count }]] = await Promise.all([
    db.query.stockMovements.findMany({
      where: eq(stockMovements.variantId, variantId),
      orderBy: [desc(stockMovements.createdAt)],
      with: { adminUser: { columns: { email: true } } },
      limit: ADMIN_PAGE_SIZE,
      offset: (page - 1) * ADMIN_PAGE_SIZE,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, variantId)),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE));
  const makeHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    if (backHref !== "/admin/inventory") params.set("back", backHref);
    const qs = params.toString();
    return qs ? `/admin/inventory/${variantId}?${qs}` : `/admin/inventory/${variantId}`;
  };

  const tableRows = movements.map((m) => ({
    key: m.id,
    cells: [
      <span key="date" className="whitespace-nowrap">
        {formatAdminDateTime(new Date(m.createdAt))}
      </span>,
      <span
        key="delta"
        className={m.delta >= 0 ? "font-medium text-success" : "font-medium text-destructive"}
      >
        {m.delta >= 0 ? `+${m.delta}` : m.delta}
      </span>,
      REASON_LABEL[m.reason] ?? m.reason,
      m.adminUser?.email ? (
        <span key="by" className="text-muted-foreground">
          {m.adminUser.email}
        </span>
      ) : (
        <span key="by" className="text-muted-foreground">
          {m.orderId ? "Checkout (order)" : "Automatic"}
        </span>
      ),
      <span key="note" className="text-muted-foreground">
        {m.note ?? "-"}
      </span>,
    ],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href={backHref} />} className="mb-2">
          <ArrowLeftIcon /> Inventory
        </Button>
        <PageHeader
          title={`${variant.product.name} - ${variant.size} / ${variant.color}`}
          description={`SKU ${variant.sku}`}
          actions={
            <AdjustStockDialog
              variantId={variantId}
              label={`${variant.product.name} (${variant.size} / ${variant.color})`}
              onHand={inventoryRow?.onHand ?? 0}
            />
          }
        />
      </div>

      {/* The dashboard's metric strip, so stock figures look the same everywhere. */}
      <div>
        <MetricStrip
          metrics={[
            {
              label: "In stock",
              value: String(inStock),
              // Green while there's stock to sell; red once it's sold out.
              color: inStock > 0 ? IN_STOCK_COLOR : SOLD_OUT_COLOR,
            },
            { label: "In hand", value: String(inventoryRow?.onHand ?? 0), color: IN_HAND_COLOR },
            {
              label: "In checkout",
              value: String(inventoryRow?.reserved ?? 0),
              color: IN_CHECKOUT_COLOR,
            },
          ]}
        />
      </div>

      {movements.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No stock changes yet" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable headers={["Date", "Change", "Reason", "By", "Note"]} rows={tableRows} />
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

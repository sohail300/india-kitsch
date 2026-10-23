import Link from "next/link";
import { ArrowRightIcon, BoxesIcon } from "lucide-react";
import type { productVariants } from "@/server/db/schema";
import { formatINR } from "@/server/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { BooleanBadge } from "@/app/admin/_components/status-badge";
import { DataTable } from "@/app/admin/_components/data-table";
import { AdjustStockDialog } from "../../inventory/adjust-stock-dialog";
import { DeleteVariantButton } from "./delete-variant-button";
import { VariantEditDialog } from "./variant-edit-dialog";
import { VariantMatrixForm } from "./variant-matrix-form";

type Variant = typeof productVariants.$inferSelect;

/**
 * The product's sizes & colours, each with its own actions: adjust stock
 * (the same dialog as the Inventory page, reason required, logged in the
 * stock history), price & selling, and delete (only if never ordered and
 * nothing is in checkout).
 */
export function VariantsPanel({
  productId,
  productName,
  productSlug,
  basePricePaise,
  variants,
  stockByVariant,
  orderedVariantIds,
}: {
  productId: string;
  productName: string;
  productSlug: string;
  basePricePaise: number;
  variants: Variant[];
  stockByVariant: Record<string, { onHand: number; reserved: number }>;
  /** Sizes & colours that appear on an order — these can be paused, never deleted. */
  orderedVariantIds: string[];
}) {
  const ordered = new Set(orderedVariantIds);
  const tableRows = variants.map((v) => {
    const stock = stockByVariant[v.id] ?? { onHand: 0, reserved: 0 };
    const available = stock.onHand - stock.reserved;
    return {
      key: v.id,
      cells: [
        // Size + Colour + SKU combined into one cell (was 3 separate
        // columns) so the table has fewer columns to scroll past before
        // reaching the actions on a phone - SKU is reference info, not
        // something read at a glance the way size/colour/stock are.
        <div key="size-color">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            {v.size}
            <span className="text-muted-foreground">/</span>
            {v.colorHex ? (
              <span
                className="inline-block size-3 rounded-full ring-1 ring-border"
                style={{ backgroundColor: v.colorHex }}
              />
            ) : null}
            {v.color}
          </span>
          <p className="font-mono text-xs text-muted-foreground">{v.sku}</p>
        </div>,
        <span key="stock" className="tabular-nums">
          <span className={available <= 0 ? "font-medium text-destructive" : "text-foreground"}>
            {available <= 0 ? "Sold out" : available}
          </span>
          {stock.reserved > 0 ? (
            <span className="ml-1.5 text-xs text-muted-foreground">
              (+{stock.reserved} in checkout)
            </span>
          ) : null}
        </span>,
        v.pricePaise ? (
          formatINR(v.pricePaise)
        ) : (
          <span key="price" className="text-muted-foreground">
            {formatINR(basePricePaise)}
          </span>
        ),
        <BooleanBadge key="active" value={v.isActive} trueLabel="Selling" falseLabel="Paused" />,
        <div key="actions" className="flex justify-end gap-0.5">
          <AdjustStockDialog
            compact
            variantId={v.id}
            label={`${productName} (${v.size} / ${v.color})`}
            onHand={stock.onHand}
          />
          <VariantEditDialog
            variant={v}
            productName={productName}
            basePricePaise={basePricePaise}
          />
          <DeleteVariantButton
            variantId={v.id}
            productId={productId}
            label={`${v.size} / ${v.color}`}
            inStock={Math.max(0, available)}
            blockedReason={
              ordered.has(v.id)
                ? "It has been ordered, so it can't be deleted — pause it instead"
                : stock.reserved > 0
                  ? `${stock.reserved} in checkout right now — try again in a few minutes`
                  : undefined
            }
          />
        </div>,
      ],
    };
  });

  return (
    <div className="flex flex-col gap-6">
      {variants.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-border">
          <EmptyState
            icon={BoxesIcon}
            title="No sizes or colours yet"
            description="Add them below, with how many of each you have."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Adjust stock, price or selling on each row.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="self-start sm:self-auto"
              render={<Link href={`/admin/inventory?product=${productId}`} />}
            >
              Stock history in Inventory <ArrowRightIcon />
            </Button>
          </div>
          <div className="rounded-2xl ring-1 ring-border">
            <DataTable
              headers={["Size / Colour", "In stock", "Price", "Status", ""]}
              headerClassNames={[undefined, undefined, undefined, undefined, "text-right"]}
              rows={tableRows}
            />
          </div>
        </div>
      )}
      <VariantMatrixForm
        productId={productId}
        productSlug={productSlug}
        existingPairs={variants.map((v) => `${v.size}::${v.color}`)}
      />
    </div>
  );
}

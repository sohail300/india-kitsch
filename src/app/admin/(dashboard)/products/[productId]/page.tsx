import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq, inArray } from "drizzle-orm";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { categories, inventory, orderItems, productVariants } from "@/server/db/schema";
import { getProductBySlug } from "@/server/modules/catalog/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/admin/_components/page-header";
import { ProductForm } from "../product-form";
import { PRODUCT_STATUS_OPTIONS } from "../product-status";
import {
  ProductSetupSteps,
  stepHref,
  type SetupStep,
  type StepsMode,
} from "../product-setup-steps";
import { VariantsPanel } from "./variants-panel";
import { ImagesPanel } from "./images-panel";
import { DeleteProductButton } from "./delete-product-button";
import { FinishSetupDialog } from "./finish-setup-dialog";

export const metadata: Metadata = { title: "Edit product - India Kitsch Admin" };

export default async function ProductDetailPage(props: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ setup?: string; step?: string }>;
}) {
  const { productId } = await props.params;
  const { setup, step: stepParam } = await props.searchParams;
  // Same three-step layout either way (product-setup-steps.tsx):
  // `?setup=` = the new-product flow; otherwise editing, with `?step=`.
  const isStep = (v: string | undefined): v is SetupStep =>
    v === "details" || v === "sizes" || v === "photos";
  const mode: StepsMode = isStep(setup) ? "setup" : "edit";
  const step: SetupStep = isStep(setup) ? setup : isStep(stepParam) ? stepParam : "details";
  const hrefFor = (target: SetupStep) => stepHref(mode, productId, target);

  const [product, allCategories] = await Promise.all([
    db.query.products.findFirst({ where: (p, { eq }) => eq(p.id, productId) }),
    db.query.categories.findMany({ orderBy: [asc(categories.name)] }),
  ]);
  if (!product) notFound();

  const full = await getProductBySlug(product.slug);
  if (!full) notFound();

  const variantIds = full.variants.map((v) => v.id);
  const stockRows =
    variantIds.length > 0
      ? await db
          .select({
            variantId: inventory.variantId,
            onHand: inventory.onHand,
            reserved: inventory.reserved,
          })
          .from(inventory)
          .where(inArray(inventory.variantId, variantIds))
      : [];
  const stockByVariant = Object.fromEntries(
    stockRows.map((r) => [r.variantId, { onHand: r.onHand, reserved: r.reserved }]),
  );

  // Sizes & colours on an order can be paused but never deleted.
  const orderedVariantIds =
    variantIds.length > 0
      ? (
          await db
            .selectDistinct({ variantId: orderItems.variantId })
            .from(orderItems)
            .where(inArray(orderItems.variantId, variantIds))
        )
          .map((r) => r.variantId)
          .filter((id): id is string => id !== null)
      : [];

  // Ever ordered? Then it can only be archived, never deleted.
  const [{ orderLines }] = await db
    .select({ orderLines: count() })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(productVariants.productId, product.id));

  // What a shopper would find: photos, sizes & colours that are selling, and stock of those.
  const onSale = full.variants.filter((v) => v.isActive);
  const inStock = onSale.reduce((sum, v) => {
    const stock = stockByVariant[v.id];
    return sum + (stock ? Math.max(0, stock.onHand - stock.reserved) : 0);
  }, 0);
  const readiness = { photos: full.images.length, sizes: onSale.length, inStock };

  const category = allCategories.find((c) => c.id === product.categoryId);
  const statusLabel =
    PRODUCT_STATUS_OPTIONS.find((o) => o.value === product.status)?.label ?? product.status;
  const headerSummary = [
    category ? `${category.name}${category.isActive ? "" : " (hidden)"}` : null,
    statusLabel,
    onSale.length === 0 ? "No sizes yet" : inStock > 0 ? `${inStock} in stock` : "Sold out",
  ]
    .filter(Boolean)
    .join(" · ");

  const categoryOptions = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
  }));

  const notReady = [
    readiness.photos === 0 ? "Add at least one photo" : null,
    readiness.sizes === 0 ? "Add sizes & colours" : null,
    readiness.sizes > 0 && readiness.inStock === 0 ? "No stock yet" : null,
  ].filter((item) => item !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/products" />} className="mb-2">
          <ArrowLeftIcon /> Products
        </Button>
        <PageHeader
          title={product.name}
          description={mode === "setup" ? "New product setup" : headerSummary}
          actions={
            mode === "edit" ? (
              <DeleteProductButton
                productId={product.id}
                productName={product.name}
                hasOrders={orderLines > 0}
              />
            ) : undefined
          }
        />
      </div>
      <ProductSetupSteps
        current={step}
        productId={product.id}
        mode={mode}
        counts={{ sizes: full.variants.length, photos: full.images.length }}
      />

      {step === "details" ? (
        mode === "setup" ? (
          <ProductForm
            categories={categoryOptions}
            initial={product}
            readiness={readiness}
            afterSaveHref={hrefFor("sizes")}
            submitLabel="Next: Sizes & colours"
            setupMode
          />
        ) : (
          <ProductForm
            categories={categoryOptions}
            initial={product}
            readiness={readiness}
            afterSaveHref={hrefFor("sizes")}
            submitLabel="Next: Sizes & colours"
          />
        )
      ) : null}

      {step === "sizes" ? (
        <VariantsPanel
          productId={product.id}
          productName={product.name}
          productSlug={product.slug}
          basePricePaise={product.pricePaise}
          variants={full.variants}
          stockByVariant={stockByVariant}
          orderedVariantIds={orderedVariantIds}
        />
      ) : null}

      {step === "photos" ? <ImagesPanel productId={product.id} images={full.images} /> : null}

      {step === "details" ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="ghost"
            render={<Link href={hrefFor(step === "sizes" ? "details" : "sizes")} />}
          >
            <ArrowLeftIcon /> Back
          </Button>
          {step === "sizes" ? (
            <Button render={<Link href={hrefFor("photos")} />}>
              Next: Photos <ArrowRightIcon />
            </Button>
          ) : mode === "setup" ? (
            <FinishSetupDialog
              productId={product.id}
              productName={product.name}
              notReady={notReady}
            />
          ) : (
            // Editing: everything here saves as you go and Status lives on
            // Details, so the last section just wraps up.
            <Button render={<Link href="/admin/products" />}>
              <CheckIcon /> Done
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

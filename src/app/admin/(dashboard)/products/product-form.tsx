"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ChevronDownIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { productStatusValues } from "@/server/modules/catalog/admin-schemas";
import { toPaise, toRupees } from "@/app/admin/_lib/money-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { createProductAction, updateProductAction } from "./actions";
import { setupStepHref } from "./product-setup-steps";
import { PRODUCT_STATUS_OPTIONS } from "./product-status";

export interface CategoryOption {
  id: string;
  name: string;
  /** A hidden category hides its products from the store — flagged in the picker. */
  isActive: boolean;
}

const MORE_OPTION_FIELDS = ["slug", "gstPercent", "hsnCode", "seoTitle", "seoDescription"] as const;

export interface ProductFormInitial {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryId: string;
  pricePaise: number;
  mrpPaise: number | null;
  gstRateBps: number;
  hsnCode: string | null;
  status: "draft" | "active" | "archived";
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

const numberString = (opts: { positive?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .refine(
      (v) => Number.isFinite(Number(v)) && (!opts.positive || Number(v) > 0),
      "Enter a valid number",
    );

const formSchema = z.object({
  name: z.string().trim().min(1, "Required").max(300),
  slug: z
    .string()
    .trim()
    .min(1, "Required")
    // Capitals are fixed for the owner rather than rejected.
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use letters, numbers and single hyphens only — no spaces or symbols (e.g. summer-kurta)",
    ),
  description: z.string().trim().max(10_000).optional().or(z.literal("")),
  categoryId: z.string().min(1, "Required"),
  priceRupees: numberString({ positive: true }),
  mrpRupees: z.string().trim().optional().or(z.literal("")),
  gstPercent: numberString(),
  hsnCode: z.string().trim().max(20).optional().or(z.literal("")),
  status: z.enum(productStatusValues),
  isFeatured: z.boolean(),
  seoTitle: z.string().trim().max(200).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProductForm({
  categories,
  initial,
  defaultGstRateBps = 1800,
  readiness,
  afterSaveHref,
  submitLabel,
  setupMode = false,
}: {
  categories: CategoryOption[];
  initial?: ProductFormInitial;
  /** New products start at the owner's default (Settings → Products & stock). */
  defaultGstRateBps?: number;
  /** What a shopper would find — drives the "Ready to go live?" warning. New products have none yet. */
  readiness?: { photos: number; sizes: number; inStock: number };
  /** Setup mode: where to go after a successful save (the next step). */
  afterSaveHref?: string;
  submitLabel?: string;
  /**
   * New-product setup: no Status field — new products are created as Draft,
   * and Live vs Draft is chosen in the dialog at the end of step 3.
   */
  setupMode?: boolean;
}) {
  const router = useRouter();
  const { run, isPending } = useAdminAction();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      slug: initial?.slug ?? "",
      description: initial?.description ?? "",
      categoryId: initial?.categoryId ?? categories[0]?.id ?? "",
      priceRupees: initial ? String(toRupees(initial.pricePaise)) : "",
      mrpRupees: initial?.mrpPaise ? String(toRupees(initial.mrpPaise)) : "",
      gstPercent: String((initial?.gstRateBps ?? defaultGstRateBps) / 100),
      hsnCode: initial?.hsnCode ?? "",
      status: initial?.status ?? "draft",
      isFeatured: initial?.isFeatured ?? false,
      seoTitle: initial?.seoTitle ?? "",
      seoDescription: initial?.seoDescription ?? "",
    },
  });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const status = useWatch({ control: form.control, name: "status" });
  const isFeatured = useWatch({ control: form.control, name: "isFeatured" });
  const name = useWatch({ control: form.control, name: "name" });
  const [moreOpen, setMoreOpen] = useState(false);

  // Never hide a mistake: a validation error in a collapsed field opens the section.
  const errors = form.formState.errors;
  const moreHasError = MORE_OPTION_FIELDS.some((f) => errors[f]);
  const showMore = moreOpen || moreHasError;

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const statusHint = PRODUCT_STATUS_OPTIONS.find((o) => o.value === status)?.hint;

  // Warn (never block) when Live would show something broken or unbuyable.
  const ready = readiness ?? { photos: 0, sizes: 0, inStock: 0 };
  const notReady = [
    ready.photos === 0 ? "Add at least one photo" : null,
    ready.sizes === 0 ? "Add sizes & colours" : null,
    ready.sizes > 0 && ready.inStock === 0 ? "No stock yet — add it in Inventory" : null,
  ].filter((item) => item !== null);

  async function onSubmit(v: FormValues) {
    const payload = {
      name: v.name,
      slug: v.slug,
      description: v.description || undefined,
      categoryId: v.categoryId,
      pricePaise: toPaise(Number(v.priceRupees)),
      mrpPaise: v.mrpRupees ? toPaise(Number(v.mrpRupees)) : undefined,
      gstRateBps: Math.round(Number(v.gstPercent) * 100),
      hsnCode: v.hsnCode || undefined,
      status: v.status,
      isFeatured: v.isFeatured,
      seoTitle: v.seoTitle || undefined,
      seoDescription: v.seoDescription || undefined,
    };

    if (isEdit) {
      const result = await run(updateProductAction(initial.id, payload), {
        successMessage: "Product saved",
      });
      if (result.ok && afterSaveHref) router.push(afterSaveHref);
    } else {
      const result = await run(createProductAction(payload), { successMessage: "Product created" });
      // Straight on to step 2 of setup.
      if (result.ok) router.push(setupStepHref(result.data.id, "sizes"));
    }
  }

  return (
    // The form wraps both the card and the footer bar, so the button can sit
    // outside the card (like step 2's Back / Next bar) and still submit.
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
        <CardContent className="flex flex-col gap-5 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              {...form.register("name", {
                onChange: (e) => {
                  if (!isEdit && !form.getFieldState("slug").isDirty) {
                    form.setValue("slug", slugify(e.target.value));
                  }
                },
              })}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className={cn("grid gap-4", !setupMode && "sm:grid-cols-2")}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-category">Category</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => v && form.setValue("categoryId", v, { shouldDirty: true })}
                items={categories.map((c) => ({
                  value: c.id,
                  label: c.isActive ? c.name : `${c.name} (hidden)`,
                }))}
              >
                <SelectTrigger id="p-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isActive ? null : <span className="text-muted-foreground"> (hidden)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId ? (
                <p className="text-xs text-destructive">{errors.categoryId.message}</p>
              ) : null}
            </div>
            {setupMode ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => v && form.setValue("status", v as FormValues["status"])}
                  items={PRODUCT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                >
                  <SelectTrigger id="p-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusHint ? <p className="text-xs text-muted-foreground">{statusHint}</p> : null}
              </div>
            )}
          </div>

          {!setupMode && status === "active" && notReady.length > 0 ? (
            <Alert role="note" className="border-warning/40 bg-warning/10">
              <TriangleAlertIcon className="text-warning-foreground" />
              <AlertTitle>Not ready to go live yet</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {notReady.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {isEdit
                  ? "Shoppers would see this product but couldn't buy it. You can still save."
                  : "Do these on the next screen after creating it."}
              </AlertDescription>
            </Alert>
          ) : null}

          {selectedCategory && !selectedCategory.isActive && status === "active" ? (
            <Alert role="note" className="bg-muted/50">
              <InfoIcon />
              <AlertDescription>
                {selectedCategory.name} is hidden, so this product won&apos;t show on the store
                until the category is visible again.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-price">Price (₹)</Label>
              <Input
                id="p-price"
                type="number"
                min={0}
                step="0.01"
                {...form.register("priceRupees")}
              />
              {errors.priceRupees ? (
                <p className="text-xs text-destructive">{errors.priceRupees.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-mrp">Original price (₹)</Label>
              <Input
                id="p-mrp"
                type="number"
                min={0}
                step="0.01"
                placeholder="Optional"
                {...form.register("mrpRupees")}
              />
              <p className="text-xs text-muted-foreground">
                Shown crossed out when it&apos;s higher than the price.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-description">Description</Label>
            <Textarea id="p-description" rows={4} {...form.register("description")} />
          </div>

          <div className="flex items-start gap-2">
            <Switch
              id="p-featured"
              checked={isFeatured}
              onCheckedChange={(checked) => form.setValue("isFeatured", checked)}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="p-featured" className="font-normal">
                Feature on the storefront
              </Label>
              <p className="text-xs text-muted-foreground">
                Marks it as a featured product for the storefront.
              </p>
            </div>
          </div>

          {/* More options — rarely needed, so collapsed by default. */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              aria-expanded={showMore}
              aria-controls="p-more-options"
              onClick={() => setMoreOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              More options
              <ChevronDownIcon
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  showMore && "rotate-180",
                )}
              />
            </button>
            {showMore ? (
              <div
                id="p-more-options"
                className="flex flex-col gap-4 border-t border-border px-4 pt-4 pb-4"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-slug">Link name (slug)</Label>
                  <Input id="p-slug" {...form.register("slug")} />
                  {errors.slug ? (
                    <p className="text-xs text-destructive">{errors.slug.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Filled in from the name. Also used for SKUs.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-gst">GST (%)</Label>
                    <Input
                      id="p-gst"
                      type="number"
                      min={0}
                      max={28}
                      step="0.01"
                      {...form.register("gstPercent")}
                    />
                    {errors.gstPercent ? (
                      <p className="text-xs text-destructive">{errors.gstPercent.message}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-hsn">HSN code</Label>
                    <Input id="p-hsn" placeholder="Optional" {...form.register("hsnCode")} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-seo-title">Search engine title</Label>
                    <Input
                      id="p-seo-title"
                      placeholder={name || "Defaults to the product name"}
                      {...form.register("seoTitle")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-seo-description">Search engine description</Label>
                    <Input
                      id="p-seo-description"
                      placeholder="Defaults to the description"
                      {...form.register("seoDescription")}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {submitLabel ?? (isEdit ? "Save changes" : "Next: Sizes & colours")}
          {afterSaveHref || !isEdit ? <ArrowRightIcon /> : null}
        </Button>
      </div>
    </form>
  );
}

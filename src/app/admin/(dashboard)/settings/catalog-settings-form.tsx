"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PackageIcon } from "lucide-react";
import type { CatalogSettingsValue } from "@/server/modules/settings/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { updateCatalogSettingsAction } from "./actions";
import { SettingsSection } from "./settings-section";

const formSchema = z.object({
  defaultGstPercent: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 28, "0–28%"),
  lowStockThreshold: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 1000, "0–1000"),
});
type FormValues = z.infer<typeof formSchema>;

/**
 * Store-wide defaults for products and stock: the GST rate new products
 * start with, and the level at which stock counts as "low" (dashboard card,
 * Inventory's "Low stock only" filter and red numbers).
 */
export function CatalogSettingsForm({
  initial,
  lastUpdated,
}: {
  initial: CatalogSettingsValue;
  lastUpdated?: string;
}) {
  const { run, isPending } = useAdminAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultGstPercent: String(initial.defaultGstRateBps / 100),
      lowStockThreshold: String(initial.lowStockThreshold),
    },
  });
  const { errors } = form.formState;

  async function onSubmit(values: FormValues) {
    await run(
      updateCatalogSettingsAction({
        defaultGstRateBps: Math.round(Number(values.defaultGstPercent) * 100),
        lowStockThreshold: Number(values.lowStockThreshold),
      }),
      { successMessage: "Products & stock settings updated" },
    );
  }

  return (
    <SettingsSection
      icon={PackageIcon}
      title="Products & stock"
      description="Defaults for new products, and when stock counts as low."
      lastUpdated={lastUpdated}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lowStockThreshold">Low stock at</Label>
            <Input
              id="lowStockThreshold"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              {...form.register("lowStockThreshold")}
            />
            {errors.lowStockThreshold ? (
              <p className="text-xs text-destructive">{errors.lowStockThreshold.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A size &amp; colour with this many or fewer left is flagged as low.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultGstPercent">Default GST for new products (%)</Label>
            <Input
              id="defaultGstPercent"
              type="number"
              min={0}
              max={28}
              step="0.01"
              {...form.register("defaultGstPercent")}
            />
            {errors.defaultGstPercent ? (
              <p className="text-xs text-destructive">{errors.defaultGstPercent.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Existing products keep their own rate. Confirm the right rate with your CA.
              </p>
            )}
          </div>
        </div>

        <Button type="submit" className="mt-1 w-fit" disabled={isPending}>
          Save products &amp; stock
        </Button>
      </form>
    </SettingsSection>
  );
}

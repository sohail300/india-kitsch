"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PencilIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatINR as formatPrice, toPaise, toRupees } from "@/app/admin/_lib/money-client";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { TooltipDialogTrigger } from "@/app/admin/_components/tooltip-dialog-trigger";
import { updateVariantAction } from "../actions";

export interface VariantEditInitial {
  id: string;
  sku: string;
  size: string;
  color: string;
  pricePaise: number | null;
  mrpPaise: number | null;
  isActive: boolean;
}

const optionalNumberString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) > 0), "Must be a positive number");

const formSchema = z
  .object({
    customPrice: z.boolean(),
    priceRupees: optionalNumberString,
    mrpRupees: optionalNumberString,
    isActive: z.boolean(),
  })
  .refine((v) => !v.customPrice || !!v.priceRupees, {
    message: "Enter the price, or turn custom price off",
    path: ["priceRupees"],
  });
type FormValues = z.infer<typeof formSchema>;

export function VariantEditDialog({
  variant,
  productName,
  basePricePaise,
}: {
  variant: VariantEditInitial;
  productName: string;
  basePricePaise: number;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customPrice: variant.pricePaise !== null || variant.mrpPaise !== null,
      priceRupees: variant.pricePaise ? String(toRupees(variant.pricePaise)) : "",
      mrpRupees: variant.mrpPaise ? String(toRupees(variant.mrpPaise)) : "",
      isActive: variant.isActive,
    },
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const customPrice = useWatch({ control: form.control, name: "customPrice" });

  async function onSubmit(v: FormValues) {
    const result = await run(
      updateVariantAction(variant.id, {
        // Custom price off = back to the product's price for this size & colour.
        pricePaise: v.customPrice && v.priceRupees ? toPaise(Number(v.priceRupees)) : null,
        mrpPaise: v.customPrice && v.mrpRupees ? toPaise(Number(v.mrpRupees)) : null,
        isActive: v.isActive,
      }),
      { successMessage: "Saved" },
    );
    if (result.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipDialogTrigger
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Price & selling for ${variant.size} / ${variant.color}`}
          >
            <PencilIcon />
          </Button>
        }
        // Size and colour themselves are fixed once created — this edits price and selling only.
        tooltip="Price & selling"
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Price &amp; selling</DialogTitle>
          <DialogDescription>
            {productName} ({variant.size} / {variant.color}).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Switch
                id="v-custom-price"
                checked={customPrice}
                onCheckedChange={(checked) =>
                  form.setValue("customPrice", checked, { shouldDirty: true })
                }
              />
              <Label htmlFor="v-custom-price" className="font-normal">
                Custom price for this size & colour
              </Label>
            </div>
            {customPrice ? null : (
              <p className="text-xs text-muted-foreground">
                Uses the product&apos;s price, {formatPrice(basePricePaise)}.
              </p>
            )}
          </div>
          {customPrice ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-price">Price (₹)</Label>
                <Input
                  id="v-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={String(toRupees(basePricePaise))}
                  {...form.register("priceRupees")}
                />
                {form.formState.errors.priceRupees ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.priceRupees.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-mrp">Original price (₹)</Label>
                <Input
                  id="v-mrp"
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
          ) : null}
          <div className="flex items-center gap-2">
            <Switch
              id="v-active"
              checked={isActive}
              onCheckedChange={(checked) => form.setValue("isActive", checked)}
            />
            <Label htmlFor="v-active" className="font-normal">
              Selling — customers can buy this size & colour
            </Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

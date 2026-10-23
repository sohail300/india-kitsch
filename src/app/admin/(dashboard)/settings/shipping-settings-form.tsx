"use client";

import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TruckIcon } from "lucide-react";
import type { ShippingSettingsValue } from "@/server/modules/settings/schemas";
import { formatINR, toPaise, toRupees } from "@/app/admin/_lib/money-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { updateShippingSettingsAction } from "./actions";
import { SettingsSection } from "./settings-section";

const nonNegativeNumberString = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, "Must be a non-negative number");

const formSchema = z.object({
  feeRupees: nonNegativeNumberString,
  freeShippingEnabled: z.boolean(),
  freeThresholdRupees: nonNegativeNumberString,
});
type FormValues = z.infer<typeof formSchema>;

/** "₹99" from a typed rupee amount, or null while the box is empty/invalid. */
function rupeesLabel(value: string | undefined): string | null {
  const n = Number(value);
  return value && value.trim() !== "" && Number.isFinite(n) && n >= 0
    ? formatINR(toPaise(n))
    : null;
}

export function ShippingSettingsForm({
  initial,
  lastUpdated,
}: {
  initial: ShippingSettingsValue;
  lastUpdated?: string;
}) {
  const { run, isPending } = useAdminAction();
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(
    initial.freeThresholdPaise !== null,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      feeRupees: String(toRupees(initial.feePaise)),
      freeShippingEnabled: initial.freeThresholdPaise !== null,
      freeThresholdRupees:
        initial.freeThresholdPaise !== null ? String(toRupees(initial.freeThresholdPaise)) : "0",
    },
  });

  const feeRaw = useWatch({ control: form.control, name: "feeRupees" });
  const fee = rupeesLabel(feeRaw);
  const threshold = rupeesLabel(useWatch({ control: form.control, name: "freeThresholdRupees" }));
  // The rule in plain words, one line per case, updated as the owner types.
  const summary: ReactNode[] | null =
    fee === null
      ? null
      : !freeShippingEnabled
        ? Number(feeRaw) === 0
          ? ["Every order ships free."]
          : [
              <>
                Every order pays <strong className="font-semibold">{fee}</strong> shipping.
              </>,
            ]
        : threshold === null
          ? null
          : [
              <>
                Orders under <strong className="font-semibold">{threshold}</strong> pay{" "}
                <strong className="font-semibold">{fee}</strong> shipping.
              </>,
              <>
                Orders of <strong className="font-semibold">{threshold}</strong> or more ship free.
              </>,
            ];

  async function onSubmit(values: FormValues) {
    await run(
      updateShippingSettingsAction({
        feePaise: toPaise(Number(values.feeRupees)),
        freeThresholdPaise: freeShippingEnabled
          ? toPaise(Number(values.freeThresholdRupees))
          : null,
      }),
      { successMessage: "Shipping settings updated" },
    );
  }

  return (
    <SettingsSection
      icon={TruckIcon}
      title="Shipping"
      description="Flat shipping fee and free-shipping threshold."
      lastUpdated={lastUpdated}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="freeShippingEnabled"
            checked={freeShippingEnabled}
            onCheckedChange={setFreeShippingEnabled}
          />
          <Label htmlFor="freeShippingEnabled" className="font-normal">
            Offer free shipping above a threshold
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={
              freeShippingEnabled ? "flex flex-col gap-1.5" : "flex flex-col gap-1.5 sm:col-span-2"
            }
          >
            <Label htmlFor="feeRupees">Shipping fee (₹)</Label>
            <Input
              id="feeRupees"
              type="number"
              step="0.01"
              min={0}
              {...form.register("feeRupees")}
            />
            {form.formState.errors.feeRupees ? (
              <p className="text-xs text-destructive">{form.formState.errors.feeRupees.message}</p>
            ) : null}
          </div>

          {freeShippingEnabled ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="freeThresholdRupees">Free shipping threshold (₹)</Label>
              <Input
                id="freeThresholdRupees"
                type="number"
                step="0.01"
                min={0}
                {...form.register("freeThresholdRupees")}
              />
            </div>
          ) : null}
        </div>

        {summary ? (
          <div
            className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground"
            aria-live="polite"
          >
            {summary.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : null}

        <Button type="submit" className="mt-1 w-fit" disabled={isPending}>
          Save shipping settings
        </Button>
      </form>
    </SettingsSection>
  );
}

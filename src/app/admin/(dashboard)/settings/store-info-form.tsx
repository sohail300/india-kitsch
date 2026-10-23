"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPinIcon, Share2Icon, StoreIcon } from "lucide-react";
import {
  GSTIN_PATTERN,
  isUrlOnSite,
  normalizePhone,
  PHONE_PATTERN,
  PINCODE_PATTERN,
  type StoreInfoValue,
} from "@/server/modules/settings/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { updateStoreInfoAction } from "./actions";
import { SettingsSection } from "./settings-section";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** Empty is fine; anything typed must pass `check` (same rules the server enforces on save). */
const optionalMatching = (check: (v: string) => boolean, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || check(v), message);

const formSchema = z.object({
  gstin: optionalMatching(
    (v) => GSTIN_PATTERN.test(v.toUpperCase()),
    "Enter a valid 15-character GSTIN",
  ),
  sellerState: z.string().trim().min(1, "Required"),
  contactEmail: z.email("Enter a valid email"),
  contactPhone: optionalMatching(
    (v) => PHONE_PATTERN.test(normalizePhone(v)),
    "Enter a 10-digit mobile number",
  ),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  addressCity: optionalText(100),
  addressPincode: optionalMatching((v) => PINCODE_PATTERN.test(v), "Enter a 6-digit pincode"),
  instagramUrl: optionalMatching(
    (v) => isUrlOnSite(v, "instagram.com"),
    "Enter an https://instagram.com/… link",
  ),
  facebookUrl: optionalMatching(
    (v) => isUrlOnSite(v, "facebook.com"),
    "Enter an https://facebook.com/… link",
  ),
});
type FormValues = z.infer<typeof formSchema>;

export function StoreInfoForm({
  initial,
  lastUpdated,
}: {
  initial: StoreInfoValue;
  /** Covers all three sections below — they're one saved record. */
  lastUpdated?: string;
}) {
  const { run, isPending } = useAdminAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gstin: initial.gstin ?? "",
      sellerState: initial.sellerState,
      contactEmail: initial.contactEmail,
      contactPhone: initial.contactPhone ?? "",
      addressLine1: initial.addressLine1 ?? "",
      addressLine2: initial.addressLine2 ?? "",
      addressCity: initial.addressCity ?? "",
      addressPincode: initial.addressPincode ?? "",
      instagramUrl: initial.instagramUrl ?? "",
      facebookUrl: initial.facebookUrl ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    await run(
      updateStoreInfoAction({
        gstin: values.gstin || undefined,
        sellerState: values.sellerState,
        contactEmail: values.contactEmail,
        contactPhone: values.contactPhone || undefined,
        addressLine1: values.addressLine1 || undefined,
        addressLine2: values.addressLine2 || undefined,
        addressCity: values.addressCity || undefined,
        addressPincode: values.addressPincode || undefined,
        instagramUrl: values.instagramUrl || undefined,
        facebookUrl: values.facebookUrl || undefined,
      }),
      { successMessage: "Store info updated" },
    );
  }

  // Three visually separate sections, one shared react-hook-form instance:
  // each section's own <form> submits the same `onSubmit`, so any one of the
  // three Save buttons validates and writes the whole `storeInfo` settings
  // object (there's only one underlying record - splitting the save into
  // three independent server actions isn't warranted for three fields each).
  // Returned as a fragment (not a wrapping element) so all three sections
  // land as direct siblings of Shipping in the settings page's divided list.
  return (
    <>
      <SettingsSection
        icon={StoreIcon}
        title="Store info"
        description="Seller details used on invoices, for GST, and in the order-email footer."
        lastUpdated={lastUpdated}
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gstin">GSTIN (leave blank if not GST-registered)</Label>
            <Input
              id="gstin"
              placeholder="e.g. 27ABCDE1234F1Z5 (optional)"
              {...form.register("gstin")}
            />
            {form.formState.errors.gstin ? (
              <p className="text-xs text-destructive">{form.formState.errors.gstin.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sellerState">Seller state</Label>
            <Input
              id="sellerState"
              placeholder="e.g. Maharashtra"
              {...form.register("sellerState")}
            />
            {form.formState.errors.sellerState ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.sellerState.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" {...form.register("contactEmail")} />
            {form.formState.errors.contactEmail ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.contactEmail.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input
              id="contactPhone"
              placeholder="e.g. 98765 43210 (optional)"
              {...form.register("contactPhone")}
            />
            {form.formState.errors.contactPhone ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.contactPhone.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="mt-1 w-fit" disabled={isPending}>
            Save store info
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        icon={MapPinIcon}
        title="Business address"
        description="Optional - shown in order-email footers."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Address line 1</Label>
              <Input id="addressLine1" placeholder="Optional" {...form.register("addressLine1")} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input id="addressLine2" placeholder="Optional" {...form.register("addressLine2")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addressCity">City</Label>
              <Input id="addressCity" placeholder="Optional" {...form.register("addressCity")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addressPincode">Pincode</Label>
              <Input
                id="addressPincode"
                placeholder="Optional"
                {...form.register("addressPincode")}
              />
              {form.formState.errors.addressPincode ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.addressPincode.message}
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" className="mt-1 w-fit" disabled={isPending}>
            Save address
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        icon={Share2Icon}
        title="Social links"
        description="Optional - shown as icons in order-email footers."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instagramUrl">Instagram</Label>
              <Input
                id="instagramUrl"
                placeholder="https://instagram.com/..."
                {...form.register("instagramUrl")}
              />
              {form.formState.errors.instagramUrl ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.instagramUrl.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="facebookUrl">Facebook</Label>
              <Input
                id="facebookUrl"
                placeholder="https://facebook.com/..."
                {...form.register("facebookUrl")}
              />
              {form.formState.errors.facebookUrl ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.facebookUrl.message}
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" className="mt-1 w-fit" disabled={isPending}>
            Save social links
          </Button>
        </form>
      </SettingsSection>
    </>
  );
}

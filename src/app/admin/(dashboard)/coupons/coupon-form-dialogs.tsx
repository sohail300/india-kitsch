"use client";

import { useState, type ReactElement } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InfoIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePickerField, parseDateValue } from "@/app/admin/_components/date-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toPaise } from "@/app/admin/_lib/money-client";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { TooltipDialogTrigger } from "@/app/admin/_components/tooltip-dialog-trigger";
import { createCouponAction, setCouponActiveAction, updateCouponAction } from "./actions";

const optionalNumberString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || Number.isFinite(Number(v)), "Must be a number");

// Date-only inputs (YYYY-MM-DD), read in the admin's local time: a coupon
// starts at the beginning of its start day and runs through the end of its
// end day. `new Date("YYYY-MM-DD")` alone would parse as UTC midnight.
const toDateInputValue = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const startOfDay = (value: string) => new Date(`${value}T00:00:00`);
const endOfDay = (value: string) => new Date(`${value}T23:59:59.999`);

// --- Create ------------------------------------------------------------

const createSchema = z
  .object({
    code: z.string().trim().min(1, "Required").max(40),
    type: z.enum(["percent", "fixed"]),
    percentValue: z.string().trim().optional().or(z.literal("")),
    fixedValueRupees: z.string().trim().optional().or(z.literal("")),
    minSubtotalRupees: optionalNumberString,
    maxDiscountRupees: optionalNumberString,
    startsAt: z.string().trim().optional().or(z.literal("")),
    endsAt: z.string().trim().optional().or(z.literal("")),
    maxUses: optionalNumberString,
    perUserLimit: optionalNumberString,
  })
  .refine((v) => v.type !== "percent" || (v.percentValue && Number(v.percentValue) > 0), {
    message: "Enter a percent value",
    path: ["percentValue"],
  })
  .refine((v) => v.type !== "fixed" || (v.fixedValueRupees && Number(v.fixedValueRupees) > 0), {
    message: "Enter an amount",
    path: ["fixedValueRupees"],
  });
type CreateFormValues = z.infer<typeof createSchema>;

export function CreateCouponDialog({ trigger }: { trigger: ReactElement }) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      code: "",
      type: "percent",
      percentValue: "",
      fixedValueRupees: "",
      minSubtotalRupees: "",
      maxDiscountRupees: "",
      startsAt: "",
      endsAt: "",
      maxUses: "",
      perUserLimit: "",
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const startsAt = useWatch({ control: form.control, name: "startsAt" }) ?? "";
  const endsAt = useWatch({ control: form.control, name: "endsAt" }) ?? "";

  async function onSubmit(v: CreateFormValues) {
    const base = {
      code: v.code,
      minSubtotalPaise: v.minSubtotalRupees ? toPaise(Number(v.minSubtotalRupees)) : 0,
      maxDiscountPaise: v.maxDiscountRupees ? toPaise(Number(v.maxDiscountRupees)) : undefined,
      startsAt: v.startsAt ? startOfDay(v.startsAt) : undefined,
      endsAt: v.endsAt ? endOfDay(v.endsAt) : undefined,
      maxUses: v.maxUses ? Number(v.maxUses) : undefined,
      perUserLimit: v.perUserLimit ? Number(v.perUserLimit) : undefined,
    };
    const payload =
      v.type === "percent"
        ? { ...base, type: "percent" as const, valueBps: Math.round(Number(v.percentValue) * 100) }
        : { ...base, type: "fixed" as const, valuePaise: toPaise(Number(v.fixedValueRupees)) };

    const result = await run(createCouponAction(payload), { successMessage: "Coupon created" });
    if (result.ok) {
      setOpen(false);
      form.reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New coupon</DialogTitle>
        </DialogHeader>
        <Alert role="note" className="bg-muted/50">
          <InfoIcon />
          <DialogDescription>
            Type and value can&apos;t be changed after creation.
          </DialogDescription>
        </Alert>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Only the fields scroll - DialogFooter's negative margins would overflow a scroll container. -mx-1/px-1 keeps focus rings unclipped. */}
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-0.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coupon-code">Code</Label>
              <Input id="coupon-code" placeholder="WELCOME10" {...form.register("code")} />
              {form.formState.errors.code ? (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => v && form.setValue("type", v as "percent" | "fixed")}
                items={[
                  { value: "percent", label: "Percent off" },
                  { value: "fixed", label: "Fixed amount off" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent off</SelectItem>
                  <SelectItem value="fixed">Fixed amount off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "percent" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-percent">Percent off (%)</Label>
                <Input
                  id="coupon-percent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...form.register("percentValue")}
                />
                {form.formState.errors.percentValue ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.percentValue.message}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-fixed">Amount off (₹)</Label>
                <Input
                  id="coupon-fixed"
                  type="number"
                  min={0}
                  step="0.01"
                  {...form.register("fixedValueRupees")}
                />
                {form.formState.errors.fixedValueRupees ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.fixedValueRupees.message}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-min">Min subtotal (₹)</Label>
                <Input
                  id="coupon-min"
                  type="number"
                  min={0}
                  step="0.01"
                  {...form.register("minSubtotalRupees")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-max-discount">Max discount (₹)</Label>
                <Input
                  id="coupon-max-discount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="No cap"
                  {...form.register("maxDiscountRupees")}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-starts">Starts</Label>
                <DatePickerField
                  id="coupon-starts"
                  value={startsAt}
                  onChange={(v) => form.setValue("startsAt", v, { shouldDirty: true })}
                  disabled={endsAt ? { after: parseDateValue(endsAt)! } : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to make it usable right away.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-ends">Ends</Label>
                <DatePickerField
                  id="coupon-ends"
                  value={endsAt}
                  onChange={(v) => form.setValue("endsAt", v, { shouldDirty: true })}
                  placeholder="No end date"
                  disabled={startsAt ? { before: parseDateValue(startsAt)! } : undefined}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-max-uses">Total use limit</Label>
                <Input
                  id="coupon-max-uses"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  {...form.register("maxUses")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coupon-per-user">Per-customer limit</Label>
                <Input
                  id="coupon-per-user"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  {...form.register("perUserLimit")}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Create coupon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Edit ----------------------------------------------------------------

export interface CouponEditInitial {
  id: string;
  code: string;
  type: "percent" | "fixed";
  valueBps: number | null;
  valuePaise: number | null;
  minSubtotalPaise: number;
  maxDiscountPaise: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  perUserLimit: number | null;
  isActive: boolean;
}

const editSchema = z.object({
  minSubtotalRupees: optionalNumberString,
  maxDiscountRupees: optionalNumberString,
  startsAt: z.string().trim().optional().or(z.literal("")),
  endsAt: z.string().trim().optional().or(z.literal("")),
  maxUses: optionalNumberString,
  perUserLimit: optionalNumberString,
});
type EditFormValues = z.infer<typeof editSchema>;

export function EditCouponDialog({
  trigger,
  tooltip,
  initial,
}: {
  trigger: ReactElement;
  /** Shown on hover/focus — for an icon-only trigger. */
  tooltip?: string;
  initial: CouponEditInitial;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      minSubtotalRupees: String(initial.minSubtotalPaise / 100),
      maxDiscountRupees: initial.maxDiscountPaise ? String(initial.maxDiscountPaise / 100) : "",
      startsAt: toDateInputValue(initial.startsAt),
      endsAt: toDateInputValue(initial.endsAt),
      maxUses: initial.maxUses ? String(initial.maxUses) : "",
      perUserLimit: initial.perUserLimit ? String(initial.perUserLimit) : "",
    },
  });

  const startsAt = useWatch({ control: form.control, name: "startsAt" }) ?? "";
  const endsAt = useWatch({ control: form.control, name: "endsAt" }) ?? "";

  async function onSubmit(v: EditFormValues) {
    const payload = {
      minSubtotalPaise: v.minSubtotalRupees ? toPaise(Number(v.minSubtotalRupees)) : 0,
      maxDiscountPaise: v.maxDiscountRupees ? toPaise(Number(v.maxDiscountRupees)) : null,
      startsAt: v.startsAt ? startOfDay(v.startsAt) : null,
      endsAt: v.endsAt ? endOfDay(v.endsAt) : null,
      maxUses: v.maxUses ? Number(v.maxUses) : null,
      perUserLimit: v.perUserLimit ? Number(v.perUserLimit) : null,
    };
    const result = await run(updateCouponAction(initial.id, payload), {
      successMessage: "Coupon updated",
    });
    if (result.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipDialogTrigger trigger={trigger} tooltip={tooltip} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {initial.code}</DialogTitle>
        </DialogHeader>
        <Alert role="note" className="bg-muted/50">
          <InfoIcon />
          <DialogDescription>Type and value are fixed once created.</DialogDescription>
        </Alert>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-min">Min subtotal (₹)</Label>
              <Input
                id="edit-min"
                type="number"
                min={0}
                step="0.01"
                {...form.register("minSubtotalRupees")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-max-discount">Max discount (₹)</Label>
              <Input
                id="edit-max-discount"
                type="number"
                min={0}
                step="0.01"
                placeholder="No cap"
                {...form.register("maxDiscountRupees")}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-starts">Starts</Label>
              <DatePickerField
                id="edit-starts"
                value={startsAt}
                onChange={(v) => form.setValue("startsAt", v, { shouldDirty: true })}
                disabled={endsAt ? { after: parseDateValue(endsAt)! } : undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-ends">Ends</Label>
              <DatePickerField
                id="edit-ends"
                value={endsAt}
                onChange={(v) => form.setValue("endsAt", v, { shouldDirty: true })}
                placeholder="No end date"
                disabled={startsAt ? { before: parseDateValue(startsAt)! } : undefined}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-max-uses">Total use limit</Label>
              <Input
                id="edit-max-uses"
                type="number"
                min={1}
                placeholder="Unlimited"
                {...form.register("maxUses")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-per-user">Per-customer limit</Label>
              <Input
                id="edit-per-user"
                type="number"
                min={1}
                placeholder="Unlimited"
                {...form.register("perUserLimit")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CouponActiveSwitch({
  id,
  code,
  isActive,
}: {
  id: string;
  code: string;
  isActive: boolean;
}) {
  const { run, isPending } = useAdminAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The switch stays on the saved state until the change is confirmed.
  const next = !isActive;

  return (
    <>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={() => setConfirmOpen(true)}
        aria-label={`${code} active`}
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {next ? "Activate" : "Deactivate"} {code}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {next
                ? "Customers will be able to apply this coupon at checkout."
                : "Customers won't be able to use this coupon until you activate it again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={async () => {
                const result = await run(setCouponActiveAction(id, next), {
                  successMessage: next ? "Coupon activated" : "Coupon deactivated",
                });
                if (result.ok) setConfirmOpen(false);
              }}
            >
              {next ? "Activate" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

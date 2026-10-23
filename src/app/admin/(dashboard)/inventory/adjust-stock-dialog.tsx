"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowUpDownIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { TooltipDialogTrigger } from "@/app/admin/_components/tooltip-dialog-trigger";
import { adjustStockAction } from "./actions";

type Direction = "increase" | "decrease";

/**
 * The reasons offered for each direction — only ones that make sense for it
 * (no "damaged" when adding stock). `movement` is the ledger category the
 * server records; the chosen label itself is saved as the movement's note,
 * so the history shows exactly what happened. "Other…" asks for free text.
 */
const REASON_OPTIONS: Record<
  Direction,
  { value: string; label: string; movement: "restock" | "return" | "adjustment" }[]
> = {
  increase: [
    { value: "new_stock", label: "New stock arrived", movement: "restock" },
    { value: "customer_return", label: "Returned by a customer", movement: "return" },
    { value: "count_found", label: "Found in a stock count", movement: "adjustment" },
    { value: "other", label: "Other…", movement: "adjustment" },
  ],
  decrease: [
    { value: "damaged", label: "Damaged or defective", movement: "adjustment" },
    { value: "sold_offline", label: "Sold outside the website", movement: "adjustment" },
    { value: "count_missing", label: "Missing in a stock count", movement: "adjustment" },
    { value: "other", label: "Other…", movement: "adjustment" },
  ],
};

const formSchema = z
  .object({
    direction: z.enum(["increase", "decrease"]),
    quantity: z
      .string()
      .trim()
      .min(1, "Required")
      .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, "Enter a whole number > 0"),
    reasonOption: z.string().min(1),
    otherReason: z.string().trim().max(500),
    note: z.string().trim().max(300),
  })
  .refine((v) => v.reasonOption !== "other" || v.otherReason.length > 0, {
    message: "Describe the reason",
    path: ["otherReason"],
  });
type FormValues = z.infer<typeof formSchema>;

export function AdjustStockDialog({
  variantId,
  label,
  onHand,
  compact = false,
}: {
  variantId: string;
  label: string;
  onHand: number;
  /** Icon-only trigger with a tooltip, for crowded rows (a product's Sizes & colours list). */
  compact?: boolean;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      direction: "increase",
      quantity: "",
      reasonOption: REASON_OPTIONS.increase[0]!.value,
      otherReason: "",
      note: "",
    },
  });
  const direction = useWatch({ control: form.control, name: "direction" });
  const reasonOption = useWatch({ control: form.control, name: "reasonOption" });
  const options = REASON_OPTIONS[direction];

  async function onSubmit(v: FormValues) {
    const option = REASON_OPTIONS[v.direction].find((o) => o.value === v.reasonOption);
    if (!option) return;
    const delta = v.direction === "increase" ? Number(v.quantity) : -Number(v.quantity);
    const result = await run(
      adjustStockAction({
        variantId,
        delta,
        reason: option.movement,
        // One note per movement: the reason, plus the optional detail after it.
        note: [option.value === "other" ? v.otherReason : option.label, v.note]
          .filter(Boolean)
          .join(" — "),
      }),
      { successMessage: "Stock adjusted" },
    );
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
      {compact ? (
        <TooltipDialogTrigger
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Adjust stock for ${label}`}>
              <ArrowUpDownIcon />
            </Button>
          }
          tooltip="Adjust stock"
        />
      ) : (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <ArrowUpDownIcon /> Adjust
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {label} - currently {onHand} in hand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => {
                  if (!v) return;
                  // Reasons differ per direction — start the new list at its first option.
                  form.setValue("direction", v as Direction);
                  form.setValue("reasonOption", REASON_OPTIONS[v as Direction][0]!.value);
                }}
                items={[
                  { value: "increase", label: "Increase" },
                  { value: "decrease", label: "Decrease" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase</SelectItem>
                  <SelectItem value="decrease">Decrease</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-qty">Quantity</Label>
              <Input
                id="adjust-qty"
                type="number"
                min={1}
                step={1}
                {...form.register("quantity")}
              />
              {form.formState.errors.quantity ? (
                <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Select
              value={reasonOption}
              onValueChange={(v) => v && form.setValue("reasonOption", v)}
              items={options.map((o) => ({ value: o.value, label: o.label }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reasonOption === "other" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-other">What happened?</Label>
              <Textarea
                id="adjust-other"
                rows={2}
                autoFocus
                placeholder={
                  direction === "increase"
                    ? "e.g. Sample returned from the photoshoot"
                    : "e.g. Given away as a gift"
                }
                {...form.register("otherReason")}
              />
              {form.formState.errors.otherReason ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.otherReason.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-note">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="adjust-note"
              rows={2}
              placeholder="e.g. Batch #12 from the tailor"
              {...form.register("note")}
            />
            {form.formState.errors.note ? (
              <p className="text-xs text-destructive">{form.formState.errors.note.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Apply adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

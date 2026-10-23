"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UndoIcon } from "lucide-react";
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
import { formatINR, toPaise } from "@/app/admin/_lib/money-client";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { refundOrderAction } from "../actions";

const schema = z.object({
  mode: z.enum(["full", "partial"]),
  amountRupees: z.string().trim().optional().or(z.literal("")),
  reason: z.string().trim().min(1, "Required").max(500),
});
type FormValues = z.infer<typeof schema>;

export function RefundDialog({
  orderId,
  remainingPaise,
}: {
  orderId: string;
  remainingPaise: number;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mode: "full", amountRupees: "", reason: "" },
  });
  const mode = useWatch({ control: form.control, name: "mode" });

  async function onSubmit(v: FormValues) {
    if (v.mode === "partial" && (!v.amountRupees || Number(v.amountRupees) <= 0)) {
      form.setError("amountRupees", { message: "Enter an amount" });
      return;
    }
    const result = await run(
      refundOrderAction({
        orderId,
        amountPaise: v.mode === "partial" ? toPaise(Number(v.amountRupees)) : undefined,
        reason: v.reason,
      }),
      { successMessage: "Refund issued" },
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
      <DialogTrigger
        render={
          <Button variant="outline">
            <UndoIcon /> Refund
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue a refund</DialogTitle>
          <DialogDescription>
            Up to <span className="font-semibold text-foreground">{formatINR(remainingPaise)}</span>{" "}
            refundable.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "full" ? "default" : "outline"}
              size="sm"
              onClick={() => form.setValue("mode", "full")}
            >
              Full refund
            </Button>
            <Button
              type="button"
              variant={mode === "partial" ? "default" : "outline"}
              size="sm"
              onClick={() => form.setValue("mode", "partial")}
            >
              Partial
            </Button>
          </div>

          {mode === "partial" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-amount">Amount (₹)</Label>
              <Input
                id="refund-amount"
                type="number"
                min={0}
                step="0.01"
                {...form.register("amountRupees")}
              />
              {form.formState.errors.amountRupees ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.amountRupees.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea id="refund-reason" rows={2} {...form.register("reason")} />
            {form.formState.errors.reason ? (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Issue refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

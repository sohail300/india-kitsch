"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { setProductStatusAction } from "../actions";

/**
 * The end of new-product setup: choose Live or Draft (step 1 has no Status
 * field). Warns — never blocks — if a shopper would find something missing,
 * then returns to the Products list.
 */
export function FinishSetupDialog({
  productId,
  productName,
  notReady,
}: {
  productId: string;
  productName: string;
  /** What's missing for a good Live product, e.g. "Add at least one photo". */
  notReady: string[];
}) {
  const router = useRouter();
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  async function finish(status: "active" | "draft") {
    const result = await run(setProductStatusAction(productId, status), {
      successMessage:
        status === "active" ? `${productName} is live` : `${productName} saved as a draft`,
    });
    if (result.ok) {
      setOpen(false);
      router.push("/admin/products");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CheckIcon /> Finish
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish setting up</DialogTitle>
            <DialogDescription>
              Put {productName} on the store now, or keep it as a draft to finish later.
            </DialogDescription>
          </DialogHeader>

          {notReady.length > 0 ? (
            <Alert role="note" className="border-warning/40 bg-warning/10">
              <TriangleAlertIcon className="text-warning-foreground" />
              <AlertTitle>Not ready to go live yet</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {notReady.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                Shoppers would see it but couldn&apos;t buy it. You can still make it live.
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => finish("draft")}>
              Keep as draft
            </Button>
            <Button disabled={isPending} onClick={() => finish("active")}>
              <CheckIcon /> Make it Live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

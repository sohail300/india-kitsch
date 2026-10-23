"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { setOrderNoteAction } from "../actions";

export function OrderNoteForm({ orderId, initialNote }: { orderId: string; initialNote: string }) {
  const { run, isPending } = useAdminAction();
  const [note, setNote] = useState(initialNote);

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Internal note, not visible to the customer…"
      />
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={isPending || note === initialNote}
        onClick={() => run(setOrderNoteAction(orderId, note), { successMessage: "Note saved" })}
      >
        Save note
      </Button>
    </div>
  );
}

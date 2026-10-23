"use client";

import { useState } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { updateImageAltAction } from "../actions";

export function ImageAltEditor({ imageId, alt }: { imageId: string; alt: string }) {
  const { run, isPending } = useAdminAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alt);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <PencilIcon className="size-3" /> {alt || "Add alt text"}
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await run(updateImageAltAction(imageId, value), { silent: true });
        if (result.ok) setEditing(false);
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 text-xs"
      />
      <Button type="submit" size="icon-xs" variant="ghost" disabled={isPending}>
        <CheckIcon />
      </Button>
    </form>
  );
}

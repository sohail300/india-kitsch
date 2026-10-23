"use client";

import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { TooltipDialogTrigger } from "@/app/admin/_components/tooltip-dialog-trigger";
import { createCategoryAction, updateCategoryAction } from "./actions";

export interface CategoryFormInitial {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

const formSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Required")
    // Capitals are fixed for the owner rather than rejected.
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use letters, numbers and single hyphens only — no spaces or symbols (e.g. summer-kurta)",
    ),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CategoryFormDialog({
  trigger,
  tooltip,
  initial,
}: {
  trigger: ReactElement;
  /** Shown on hover/focus — for an icon-only trigger. */
  tooltip?: string;
  initial?: CategoryFormInitial;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      slug: initial?.slug ?? "",
      description: initial?.description ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      slug: values.slug,
      description: values.description || undefined,
    };

    const result = isEdit
      ? await run(updateCategoryAction(initial.id, payload), { successMessage: "Category updated" })
      : await run(createCategoryAction(payload), { successMessage: "Category created" });

    if (result.ok) {
      setOpen(false);
      if (!isEdit) form.reset();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !isEdit) form.reset();
      }}
    >
      <TooltipDialogTrigger trigger={trigger} tooltip={tooltip} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this category's details."
              : "Products are grouped under a category, e.g. Suits or Kurtas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              {...form.register("name", {
                onChange: (e) => {
                  if (!isEdit && !form.getFieldState("slug").isDirty) {
                    form.setValue("slug", slugify(e.target.value));
                  }
                },
              })}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input id="cat-slug" {...form.register("slug")} />
            {form.formState.errors.slug ? (
              <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" rows={3} {...form.register("description")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

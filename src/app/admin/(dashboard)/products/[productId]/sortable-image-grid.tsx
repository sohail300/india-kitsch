"use client";

import { useId, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { reorderImagesAction } from "../actions";
import { ImageAltEditor } from "./image-row-actions";

export interface GridImage {
  id: string;
  alt: string;
  /** Full URL, or null when the image base URL isn't configured. */
  src: string | null;
}

/**
 * The product's photos, reordered by dragging a card's grip handle — the
 * same interaction as the Categories list (dnd-kit; mouse, touch, or
 * keyboard: Space to pick up, arrows to move, Space to drop). The first
 * photo is the main one. The new order shows immediately and is saved;
 * if saving fails the photos snap back and an error toast shows.
 */
export function SortableImageGrid({
  productId,
  images,
}: {
  productId: string;
  images: GridImage[];
}) {
  const { run, isPending } = useAdminAction();
  const dndId = useId();
  const serverIds = images.map((i) => i.id);

  // Local order so a drop shows instantly; reset when the server's list changes.
  const [order, setOrder] = useState(serverIds);
  const [syncedWith, setSyncedWith] = useState(serverIds.join(","));
  if (syncedWith !== serverIds.join(",")) {
    setSyncedWith(serverIds.join(","));
    setOrder(serverIds);
  }

  const byId = new Map(images.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i) => i !== undefined);
  const labelOf = (id: string | number) => {
    const alt = byId.get(String(id))?.alt;
    return alt ? `photo "${alt}"` : `photo ${order.indexOf(String(id)) + 1}`;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    const result = await run(reorderImagesAction({ productId, imageIdsInOrder: next }), {
      silent: true,
    });
    if (!result.ok) setOrder(previous);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${labelOf(active.id)} is now at position ${order.indexOf(String(over.id)) + 1} of ${order.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${labelOf(active.id)} dropped at position ${order.indexOf(String(over.id)) + 1} of ${order.length}.`
              : `${labelOf(active.id)} dropped.`,
          onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
        },
      }}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((image, index) => (
            <SortablePhoto key={image.id} image={image} isMain={index === 0} disabled={isPending} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortablePhoto({
  image,
  isMain,
  disabled,
}: {
  image: GridImage;
  isMain: boolean;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border",
        isDragging && "z-10 shadow-lg ring-primary/40",
      )}
    >
      <div className="relative aspect-square bg-muted">
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.alt} className="size-full object-contain" />
        ) : null}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${image.alt || "photo"}`}
          className={cn(
            "absolute top-2 right-2 flex size-8 touch-none items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            disabled ? "cursor-progress opacity-60" : "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        {isMain ? (
          <span className="absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
            Main photo
          </span>
        ) : null}
      </div>
      <div className="p-2.5">
        <ImageAltEditor imageId={image.id} alt={image.alt} />
      </div>
    </div>
  );
}

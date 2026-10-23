"use client";

import { useId, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTableHead, type DataTableSortLink } from "@/app/admin/_components/data-table";
import type { ActionResult } from "@/app/admin/_lib/action-result";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";

export interface SortableDataTableRow {
  /** The id the reorder action receives, in the new order. */
  id: string;
  /** Short name for screen-reader announcements ("Picked up Suits"). */
  label: string;
  cells: ReactNode[];
}

/**
 * A `DataTable` whose rows are reordered by dragging a grip handle (dnd-kit):
 * mouse, touch, or keyboard (focus the grip, Space to pick up, ↑/↓ to move,
 * Space to drop, Esc to cancel). Only the handle starts a drag, so switches
 * and buttons in the row keep working normally.
 *
 * The new order shows immediately and is saved through `reorderAction` (a
 * Server Action taking the ids in order); if saving fails the rows snap back
 * and the usual error toast shows.
 */
export function SortableDataTable({
  headers,
  headerClassNames,
  sortLinks,
  rows,
  reorderAction,
}: {
  /** Headers for the data columns - the grip column is added automatically. */
  headers: string[];
  headerClassNames?: (string | undefined)[];
  /** Parallel to `headers`, as in DataTable — lets the admin switch to a column sort. */
  sortLinks?: (DataTableSortLink | undefined)[];
  rows: SortableDataTableRow[];
  reorderAction: (orderedIds: string[]) => Promise<ActionResult<unknown>>;
}) {
  const { run, isPending } = useAdminAction();
  // dnd-kit's own accessibility ids come from a module counter that can differ
  // between the server render and hydration; a React id keeps them stable.
  const dndId = useId();
  const serverIds = rows.map((r) => r.id);

  // Local order, so a drop shows instantly. Reset whenever the server's order
  // (or the set of rows) changes - after a save, a create or a delete.
  const [order, setOrder] = useState(serverIds);
  const [syncedWith, setSyncedWith] = useState(serverIds.join(","));
  if (syncedWith !== serverIds.join(",")) {
    setSyncedWith(serverIds.join(","));
    setOrder(serverIds);
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const orderedRows = order.map((id) => rowById.get(id)).filter((r) => r !== undefined);

  const sensors = useSensors(
    // A few px of movement before a drag starts, so a plain click on the grip does nothing.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    const result = await run(reorderAction(next), { silent: true });
    if (!result.ok) setOrder(previous);
  }

  const labelOf = (id: string | number) => rowById.get(String(id))?.label ?? "Row";

  return (
    <div className="overflow-x-auto">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <span className="sr-only">Reorder</span>
              </TableHead>
              {headers.map((header, i) => (
                <DataTableHead
                  key={header || i}
                  label={header}
                  sort={sortLinks?.[i]}
                  className={headerClassNames?.[i]}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {orderedRows.map((row) => (
                <SortableRow key={row.id} row={row} disabled={isPending} />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>
    </div>
  );
}

function SortableRow({ row, disabled }: { row: SortableDataTableRow; disabled: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative bg-background",
        isDragging && "z-10 shadow-md ring-1 ring-border hover:bg-background",
      )}
    >
      <TableCell className="w-10">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${row.label}`}
          className={cn(
            "flex size-7 touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            disabled ? "cursor-progress opacity-50" : "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      </TableCell>
      {row.cells.map((cell, i) => (
        <TableCell key={i}>{cell}</TableCell>
      ))}
    </TableRow>
  );
}

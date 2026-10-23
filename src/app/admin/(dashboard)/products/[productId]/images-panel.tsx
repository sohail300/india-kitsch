import { ImageIcon } from "lucide-react";
import type { productImages } from "@/server/db/schema";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { SortableImageGrid } from "./sortable-image-grid";
import { ImageUploader } from "./image-uploader";

type ProductImage = typeof productImages.$inferSelect;

const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;

export function ImagesPanel({ productId, images }: { productId: string; images: ProductImage[] }) {
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-4">
      <ImageUploader
        productId={productId}
        nextSortOrder={sorted.length}
        isFirstImage={sorted.length === 0}
      />

      {sorted.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-border">
          <EmptyState
            icon={ImageIcon}
            title="No photos yet"
            description="Upload product photos above."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Drag a photo by its handle to reorder. The first photo is the main one shown on the
            store.
          </p>
          <SortableImageGrid
            productId={productId}
            images={sorted.map((image) => ({
              id: image.id,
              alt: image.alt,
              src: imageBaseUrl ? `${imageBaseUrl}/${image.r2Key}` : null,
            }))}
          />
        </div>
      )}
    </div>
  );
}

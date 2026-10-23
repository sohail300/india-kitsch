"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resizeImageToWebp } from "./resize-image";

interface SignResponse {
  uploadUrl: string;
  key: string;
}

/**
 * The direct-to-R2 upload flow (docs/07 §12): resize in-browser, sign,
 * PUT straight to R2, then commit. Sign/commit go through the existing
 * `/api/admin/uploads/{sign,commit}` route handlers (Phase 7) rather than
 * a Server Action - a Server Action can't receive the browser's direct PUT
 * to R2 in between.
 */
export function ImageUploader({
  productId,
  nextSortOrder,
  isFirstImage,
}: {
  productId: string;
  nextSortOrder: number;
  isFirstImage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      let sortOrder = nextSortOrder;
      for (const file of Array.from(files)) {
        await uploadOne(file, sortOrder === nextSortOrder && isFirstImage);
        sortOrder++;
      }
      toast.success(files.length > 1 ? "Images uploaded" : "Image uploaded");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadOne(file: File, isPrimary: boolean) {
    const { blob, width, height } = await resizeImageToWebp(file);

    const signRes = await fetch("/api/admin/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        contentType: "image/webp",
        sizeBytes: blob.size,
      }),
    });
    if (!signRes.ok) throw new Error(`Could not get an upload URL (${signRes.status})`);
    const { uploadUrl, key }: SignResponse = await signRes.json();

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

    const commitRes = await fetch("/api/admin/uploads/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        key,
        alt: file.name.replace(/\.[^.]+$/, ""),
        width,
        height,
        sortOrder: nextSortOrder,
        isPrimary,
      }),
    });
    const commitData = await commitRes.json();
    if (!commitRes.ok || commitData.ok === false) {
      throw new Error(commitData.message ?? "Could not save the uploaded image");
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        Upload images
      </Button>
    </div>
  );
}

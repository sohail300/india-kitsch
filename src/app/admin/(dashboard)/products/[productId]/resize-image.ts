/**
 * Resizes/compresses an image to WebP in the browser before upload (docs/07
 * §12 step 1: "The admin UI resizes/compresses each image to WebP (max
 * ~2000 px) in the browser" - the server never decodes image bytes, so this
 * is the only place dimensions get computed).
 */
export async function resizeImageToWebp(
  file: File,
  maxDimension = 2000,
  quality = 0.9,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Failed to encode image as WebP");

  return { blob, width, height };
}

import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import type { Db, DbOrTx } from "@/server/db/client";
import { productImages, products, productVariants } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { createId } from "@/server/lib/ids";
import { writeAuditLog } from "@/server/modules/admin/audit";
import {
  createPresignedPutUrl,
  createR2Client,
  deleteObject,
  headObject,
  readObjectPrefix,
} from "./r2";
import type { R2ObjectHead } from "./r2";

/**
 * The direct-to-R2 upload flow (docs/07 §12): the admin UI resizes/
 * compresses to WebP in the browser (so `width`/`height` come from the
 * client at commit time - this server never decodes image bytes), then
 * sign -> browser PUT -> commit, with commit doing the real server-side
 * verification a presigned URL alone can't guarantee.
 */

export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<AllowedImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const signUploadInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
});
export type SignUploadInput = z.infer<typeof signUploadInputSchema>;

export interface SignUploadResult {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
}

const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 300;

/** `POST /api/admin/uploads/sign` (docs/07 §12 step 2). */
export async function signProductImageUpload(
  rawInput: unknown,
  dbHandle: DbOrTx = db,
  client = createR2Client(),
): Promise<SignUploadResult> {
  const input: SignUploadInput = signUploadInputSchema.parse(rawInput);

  const product = await dbHandle.query.products.findFirst({
    where: eq(products.id, input.productId),
  });
  if (!product) throw new NotFoundError(`Product ${input.productId}`);

  if (input.variantId) {
    const variant = await dbHandle.query.productVariants.findFirst({
      where: eq(productVariants.id, input.variantId),
    });
    if (!variant || variant.productId !== input.productId) {
      throw new NotFoundError(`Variant ${input.variantId} on product ${input.productId}`);
    }
  }

  const key = `products/${input.productId}/${createId()}.${CONTENT_TYPE_EXTENSIONS[input.contentType]}`;
  const uploadUrl = await createPresignedPutUrl(client, key, input.contentType);

  return { uploadUrl, key, expiresInSeconds: PRESIGNED_UPLOAD_EXPIRY_SECONDS };
}

export const commitUploadInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  key: z.string().min(1),
  alt: z.string().trim().min(1).max(300),
  /** Client-supplied - the browser already resized/compressed the image and knows its real dimensions. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative().default(0),
  isPrimary: z.boolean().default(false),
});
export type CommitUploadInput = z.infer<typeof commitUploadInputSchema>;

export type CommitUploadResult =
  | { ok: true; image: typeof productImages.$inferSelect }
  | {
      ok: false;
      code: "not_found" | "too_large" | "invalid_content_type" | "magic_bytes_mismatch";
      message: string;
    };

const MAGIC_BYTE_CHECKS: Record<AllowedImageContentType, (bytes: Buffer) => boolean> = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  "image/webp": (b) =>
    b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

function isAllowedContentType(value: string | undefined): value is AllowedImageContentType {
  return !!value && (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * `POST /api/admin/uploads/commit` (docs/07 §12 step 4): HEAD for size/
 * type, range-read the first bytes to verify magic bytes, then insert the
 * `product_images` row. Any verification failure deletes the object from
 * R2 rather than leaving an unreferenced upload behind - no need for the
 * weekly orphan sweep (docs/07 §12 step 5, not yet built) to clean up a
 * failure this function already knows about.
 */
export async function commitProductImageUpload(
  rawInput: unknown,
  adminUserId: string,
  dbHandle: Db = db,
  client = createR2Client(),
): Promise<CommitUploadResult> {
  const input: CommitUploadInput = commitUploadInputSchema.parse(rawInput);

  // A signed URL only ever targets products/{productId}/... - a key for a
  // different product is either a bug or someone probing another product's namespace.
  if (!input.key.startsWith(`products/${input.productId}/`)) {
    return { ok: false, code: "not_found", message: "Upload key does not belong to this product" };
  }

  const product = await dbHandle.query.products.findFirst({
    where: eq(products.id, input.productId),
  });
  if (!product)
    return { ok: false, code: "not_found", message: `Product ${input.productId} not found` };

  let head: R2ObjectHead;
  try {
    head = await headObject(client, input.key);
  } catch {
    return { ok: false, code: "not_found", message: "Uploaded object not found in R2" };
  }

  if (!head.contentLength || head.contentLength > MAX_UPLOAD_SIZE_BYTES) {
    await deleteObject(client, input.key).catch(() => {});
    return {
      ok: false,
      code: "too_large",
      message: `Uploaded object is ${head.contentLength ?? "an unknown size"}, exceeds ${MAX_UPLOAD_SIZE_BYTES} bytes`,
    };
  }
  if (!isAllowedContentType(head.contentType)) {
    await deleteObject(client, input.key).catch(() => {});
    return {
      ok: false,
      code: "invalid_content_type",
      message: `Unsupported content type: ${head.contentType}`,
    };
  }

  const prefix = await readObjectPrefix(client, input.key, 12);
  if (!MAGIC_BYTE_CHECKS[head.contentType](prefix)) {
    await deleteObject(client, input.key).catch(() => {});
    return {
      ok: false,
      code: "magic_bytes_mismatch",
      message: "File content doesn't match its declared type",
    };
  }

  const image = await dbHandle.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(productImages)
      .values({
        id: createId(),
        productId: input.productId,
        variantId: input.variantId,
        r2Key: input.key,
        alt: input.alt,
        width: input.width,
        height: input.height,
        sortOrder: input.sortOrder,
        isPrimary: input.isPrimary,
      })
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "product.uploadImage",
      entityType: "product_image",
      entityId: inserted!.id,
      after: inserted,
    });

    return inserted!;
  });

  return { ok: true, image };
}

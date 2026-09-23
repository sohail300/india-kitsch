import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/lib/env";

/**
 * R2 client wrapper (docs/07 §12) — the S3-compatible API proven working
 * in the Phase 0 spike (scripts/phase0-r2-check.ts). `client` is exported
 * so tests can pass a differently-configured `S3Client` where needed
 * (none currently do — R2 has no local emulator in this project, so
 * uploads/commit tests run against the real dev bucket, matching every
 * other "verify against real infrastructure" module so far).
 */
export function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
}

const PRESIGNED_PUT_EXPIRY_SECONDS = 300;

export async function createPresignedPutUrl(
  client: S3Client,
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGNED_PUT_EXPIRY_SECONDS },
  );
}

export interface R2ObjectHead {
  contentType: string | undefined;
  contentLength: number | undefined;
}

export async function headObject(client: S3Client, key: string): Promise<R2ObjectHead> {
  const head = await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return { contentType: head.ContentType, contentLength: head.ContentLength };
}

/** Reads only the first `byteCount` bytes — enough for a magic-byte check, never the whole object. */
export async function readObjectPrefix(
  client: S3Client,
  key: string,
  byteCount: number,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Range: `bytes=0-${byteCount - 1}` }),
  );
  const bytes = await response.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function deleteObject(client: S3Client, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

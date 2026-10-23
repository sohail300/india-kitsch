import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/lib/env";

/**
 * R2 client wrapper (docs/07 §12) - the S3-compatible API proven working
 * in the Phase 0 spike (scripts/phase0-r2-check.ts). `client` is exported
 * so tests can pass a differently-configured `S3Client` where needed
 * (none currently do - R2 has no local emulator in this project, so
 * uploads/commit tests run against the real dev bucket, matching every
 * other "verify against real infrastructure" module so far).
 */
export function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // AWS SDK v3 (>= 3.729) otherwise adds a CRC32 checksum to every request
    // — including presigned URLs, where it's computed over an *empty* body
    // (`x-amz-checksum-crc32=AAAAAA==`), so R2 would reject the real upload.
    // Only checksum when an operation actually requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
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

/** Reads only the first `byteCount` bytes - enough for a magic-byte check, never the whole object. */
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

export interface R2ObjectSummary {
  key: string;
  lastModified: Date | undefined;
}

/** Every object under `prefix`, paginating through `ListObjectsV2`'s 1000-key
 * page limit - the orphan sweep (docs/07 §12 step 5) is the only caller, and
 * the whole `products/` prefix is expected to stay well under what a single
 * cron run can page through. */
export async function listObjects(client: S3Client, prefix: string): Promise<R2ObjectSummary[]> {
  const objects: R2ObjectSummary[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) objects.push({ key: obj.Key, lastModified: obj.LastModified });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

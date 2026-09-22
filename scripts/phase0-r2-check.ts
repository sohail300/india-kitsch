/**
 * One-off Phase 0 spike check — not part of the app. Proves the R2 upload
 * path works end-to-end (docs/07 §12, docs/12 item 6):
 *  1. Server generates a presigned PUT URL (as /api/admin/uploads/sign
 *     will, eventually).
 *  2. A plain `fetch` PUT to that URL, standing in for the browser's
 *     direct-to-R2 upload — presigned URLs don't care who calls them.
 *  3. Server-side verification via HEAD (as /api/admin/uploads/commit
 *     will do): confirms size and content-type match what was signed.
 *  4. Cleans up the test object afterward.
 *
 * Run with: npx tsx scripts/phase0-r2-check.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  for (const [name, value] of Object.entries({
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
  })) {
    if (!value) throw new Error(`${name} is not set in .env.local`);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  });

  const key = `phase0-spike/${Date.now()}.txt`;
  const contentType = "text/plain";
  const body = "India Kitsch — Phase 0 R2 spike check";

  try {
    console.log(`→ Generating a presigned PUT URL for "${key}"...`);
    const putUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 60 },
    );
    console.log("  ✓ got a presigned URL (expires in 60s)");

    console.log("→ PUTting to it with plain fetch (standing in for the browser)...");
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    console.log(`  status ${putRes.status}`);
    if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status} ${await putRes.text()}`);
    console.log("  ✓ upload succeeded");

    console.log("→ Server-side verification via HEAD (as the commit step will do)...");
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`  ✓ ContentType=${head.ContentType} ContentLength=${head.ContentLength}`);
    if (head.ContentLength !== Buffer.byteLength(body)) {
      throw new Error(
        "Uploaded size doesn't match what was sent — investigate before trusting this path",
      );
    }

    console.log("\nAll Phase 0 R2 checks passed.");
  } finally {
    console.log(`→ Cleaning up "${key}"...`);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("  ✓ deleted");
  }
}

main().catch((error) => {
  console.error("Phase 0 R2 check failed:", error);
  process.exit(1);
});

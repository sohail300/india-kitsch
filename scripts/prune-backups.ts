/**
 * Applies the rolling backup retention policy (docs/08 §16) to the
 * `backups/` prefix in R2. Dry-run by default — pass --execute to
 * actually delete anything. See scripts/lib/backup-retention.ts for the
 * (separately, exhaustively unit-tested) selection logic this calls.
 *
 * Run with:
 *   npx tsx scripts/prune-backups.ts              # dry run, logs only
 *   npx tsx scripts/prune-backups.ts --execute     # actually deletes
 *
 * Runs weekly (.github/workflows/prune-backups.yml), separate from the
 * daily backup-creation job on purpose — a bug here can never take the
 * backup job down with it, and day-granularity tiers don't need
 * pruning more often than that anyway.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import { selectKeysToDelete, type BackupObject } from "./lib/backup-retention";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

async function listBackups(client: S3Client, bucket: string): Promise<BackupObject[]> {
  const objects: BackupObject[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "backups/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of (res.Contents ?? []) as _Object[]) {
      if (obj.Key && obj.LastModified) {
        objects.push({ key: obj.Key, uploadedAt: obj.LastModified });
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const bucket = requireEnv("R2_BUCKET");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  console.log(`→ Listing backups/ in ${bucket}...`);
  const objects = await listBackups(client, bucket);
  console.log(`  ✓ found ${objects.length} backup object(s)`);

  const toDelete = selectKeysToDelete(objects, new Date());
  const toKeep = objects.length - toDelete.length;

  console.log(`\n${toDelete.length} object(s) selected for deletion, ${toKeep} would remain:`);
  for (const key of toDelete) console.log(`  - ${key}`);

  if (toDelete.length === 0) {
    console.log("\nNothing to prune.");
    return;
  }

  if (!execute) {
    console.log("\nDry run only — nothing deleted. Re-run with --execute to actually delete.");
    return;
  }

  console.log(`\n→ Deleting ${toDelete.length} object(s)...`);
  // R2's DeleteObjects accepts up to 1000 keys per call.
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
  }
  console.log("  ✓ deleted");
}

main().catch((error) => {
  console.error("Prune failed:", error);
  process.exit(1);
});

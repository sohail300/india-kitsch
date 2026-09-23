/**
 * Encrypted database backup (docs/08 §16). Dumps Postgres via `pg_dump`,
 * encrypts with age, uploads to R2 and (if configured) Backblaze B2.
 *
 * Run with: npx tsx scripts/backup-db.ts [--reason=scheduled|pre-migration]
 *
 * Requires `pg_dump` on PATH (PostgreSQL client tools) — not available on
 * this project's Windows dev machine, only verified to actually run in
 * GitHub Actions (ubuntu-latest, `apt-get install postgresql-client`) or
 * on Ubuntu. Everything else here (encryption, R2/B2 upload) has been
 * tested independently against the real services — see the two
 * `_tmp-*` spike scripts run during Phase 2, since removed.
 *
 * TODO before production (docs/11 §27): this currently uploads to the
 * `backups/` prefix of the same bucket product images use, reusing that
 * token, because a dedicated `ik-backups` bucket + scoped token hasn't
 * been created yet. Split them before launch — the whole point of a
 * scoped token is that a leaked one only grants access to one concern.
 *
 * Old backups are pruned separately, on their own weekly schedule — see
 * scripts/prune-backups.ts, not this file.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Encrypter } from "age-encryption";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

async function dumpDatabase(): Promise<Buffer> {
  // Session pooler, not the transaction pooler the app uses — see
  // docs/01 §0 point 7 and docs/08 §18.
  const databaseUrl = requireEnv("DATABASE_URL_SESSION");
  const { stdout } = await execFileAsync(
    "pg_dump",
    [databaseUrl, "--format=custom", "--no-owner", "--no-privileges", "--schema=app"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 },
  );
  return stdout;
}

async function encryptDump(dump: Buffer, publicKey: string): Promise<Uint8Array> {
  const encrypter = new Encrypter();
  encrypter.addRecipient(publicKey);
  return encrypter.encrypt(dump);
}

async function uploadToR2(key: string, body: Uint8Array): Promise<void> {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: `backups/${key}`,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
}

async function uploadToB2(key: string, body: Uint8Array): Promise<void> {
  const endpoint = process.env.B2_ENDPOINT;
  const bucket = process.env.B2_BUCKET;
  const accessKeyId = process.env.B2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.warn(
      "⚠ B2 not configured (B2_ENDPOINT/B2_BUCKET/B2_ACCESS_KEY_ID/B2_SECRET_ACCESS_KEY) — " +
        "skipping the off-Cloudflare copy. The R2 copy above is still real, but docs/16's " +
        "whole point is not depending on one vendor. Set these up before launch.",
    );
    return;
  }

  const client = new S3Client({
    region: "us-west-000", // B2's region is endpoint-specific; adjust to match your bucket
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
}

async function main() {
  const reason = process.argv.find((a) => a.startsWith("--reason="))?.split("=")[1] ?? "manual";
  const publicKey = requireEnv("BACKUP_AGE_PUBLIC_KEY");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `india-kitsch-${timestamp}-${reason}.dump.age`;

  console.log(`→ Dumping database (pg_dump, reason=${reason})...`);
  const dump = await dumpDatabase();
  console.log(`  ✓ dumped ${dump.byteLength} bytes`);

  console.log("→ Encrypting with age...");
  const encrypted = await encryptDump(dump, publicKey);
  console.log(`  ✓ encrypted to ${encrypted.byteLength} bytes`);

  console.log(`→ Uploading to R2 (backups/${key})...`);
  await uploadToR2(key, encrypted);
  console.log("  ✓ uploaded to R2");

  console.log("→ Uploading to B2 (off-Cloudflare copy)...");
  await uploadToB2(key, encrypted);

  console.log(`\nBackup complete: ${key}`);
}

main().catch((error) => {
  console.error("Backup failed:", error);
  process.exit(1);
});

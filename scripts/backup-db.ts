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
import { Agent as HttpsAgent } from "node:https";
import { promisify } from "node:util";
import { Encrypter } from "age-encryption";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

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

/** B2_ENDPOINT may be pasted with or without a scheme (`s3.ca-east-006.backblazeb2.com` vs `https://...`) — normalize either form. */
function normalizeB2Endpoint(raw: string): string {
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}

/** B2's S3-compatible API requires the signing region to match the bucket's actual region (`s3.<region>.backblazeb2.com`) — it's not the same for every bucket, so this can't be a hardcoded constant. */
function b2RegionFromEndpoint(endpoint: string): string {
  const match = /s3\.([a-z0-9-]+)\.backblazeb2\.com/.exec(endpoint);
  if (!match) {
    throw new Error(`Could not determine B2 region from B2_ENDPOINT: ${endpoint}`);
  }
  return match[1]!;
}

async function uploadToB2(key: string, body: Uint8Array): Promise<void> {
  const rawEndpoint = process.env.B2_ENDPOINT;
  const bucket = process.env.B2_BUCKET;
  const accessKeyId = process.env.B2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY;

  if (!rawEndpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.warn(
      "⚠ B2 not configured (B2_ENDPOINT/B2_BUCKET/B2_ACCESS_KEY_ID/B2_SECRET_ACCESS_KEY) — " +
        "skipping the off-Cloudflare copy. The R2 copy above is still real, but docs/16's " +
        "whole point is not depending on one vendor. Set these up before launch.",
    );
    return;
  }

  const endpoint = normalizeB2Endpoint(rawEndpoint);
  const client = new S3Client({
    region: b2RegionFromEndpoint(endpoint),
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Verified directly (Phase 9 B2 setup): Node's default dual-stack
    // dialer tried several of Backblaze's IPv6 addresses, each timing out,
    // before ever falling back to IPv4 — even though IPv4 reaches this
    // same host in ~3s. Forcing IPv4 here removes that class of failure
    // on any network with a similarly bad IPv6 route to Backblaze.
    requestHandler: new NodeHttpHandler({ httpsAgent: new HttpsAgent({ family: 4 }) }),
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

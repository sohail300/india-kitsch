# Restore Runbook

> Referenced from docs/08 §16. Read that section first for the backup design (why every 12 hours, why rolling retention pruned weekly rather than kept forever, why age, why two copies). This is the "how", for when it's actually needed.

## Before you start

- Figure out which failure you're recovering from — it changes the first step:
  - **Bad migration or admin mistake, noticed within minutes/hours** → try a Supabase point-in-time option first if the plan has one; otherwise go straight to the dump restore below (docs/08 §16: Supabase Free has no PITR, so the dump _is_ the point-in-time story).
  - **Total Supabase project loss/lockout** → create a fresh Supabase project first, then restore into it.
  - **Suspected data corruption from a bug, not infra loss** → don't restore yet; get a second opinion first, since restoring loses everything written since the dump.

## 1. Get the latest encrypted dump

- R2 (primary): `backups/` prefix in the bucket named in `R2_BUCKET` — objects are named `india-kitsch-<timestamp>-<reason>.dump.age`. Newest by timestamp in the name, or by upload date in the R2 dashboard.
- B2 (off-Cloudflare copy): same object, same key, in the B2 bucket — use this if the Cloudflare account itself is the thing that's gone.
- Download it (Cloudflare dashboard, or `aws s3 cp` pointed at the R2/B2 endpoint with the relevant credentials).

## 2. Decrypt it

You need the **private** half of the age keypair — it lives in a password manager, never in this repo. If it's genuinely lost, every existing backup is permanently unreadable; that's not recoverable, which is exactly why it must be in a password manager and nowhere else.

```bash
# Using the age-encryption npm package (no system `age` binary required):
npx tsx -e '
import { readFileSync, writeFileSync } from "node:fs";
import { Decrypter } from "age-encryption";
const identity = readFileSync("path/to/your/private-key.txt", "utf-8").trim();
const encrypted = readFileSync("downloaded-backup.dump.age");
const d = new Decrypter();
d.addIdentity(identity);
const plain = await d.decrypt(encrypted);
writeFileSync("restored.dump", plain);
'
```

(Or the system `age` CLI if you have it: `age --decrypt -i private-key.txt -o restored.dump downloaded-backup.dump.age`.)

## 3. Restore into Postgres

The dump is `pg_dump --format=custom`, so it needs `pg_restore`, not `psql`:

```bash
# Fresh Supabase project, or any Postgres:
pg_restore --no-owner --no-privileges -d "$TARGET_DATABASE_URL_SESSION" restored.dump
```

**If restoring onto a non-Supabase Postgres** (Neon, self-hosted — see docs/03 §4 "Portability note"): the dump's RLS policies/grants reference Supabase's `anon`/`authenticated` roles, which won't exist there. Expect a handful of harmless "role does not exist" errors on just those statements. `--no-owner --no-privileges` (already in the command above) skips most of this; anything left over is safe to ignore since a non-Supabase host has no REST layer to protect against anyway.

## 4. Point the app at it

- Update `DATABASE_URL` (transaction pooler) and `DATABASE_URL_SESSION` (session pooler) in Vercel's project settings for whichever environment you restored.
- If it's a brand-new Supabase project: redo the schema lockdown from docs/03 §4 / docs/04 §14 (`app`/`keepalive` schemas, RLS, exposed-schemas list) — the dump includes the `app` schema's data and structure, but **not** Supabase's own project-level Data API settings, since those live outside Postgres. Re-check with the same anon-key REST test from Phase 0 (`app` tables unreachable, `keepalive.ping` readable).
- Redeploy (or just wait for the next request — Vercel functions pick up new env vars on the next cold start).

## 5. Reconcile payments

Any orders written between the dump's timestamp and the incident are gone from the DB but may still exist in Razorpay. Compare Razorpay's captured-payments list (dashboard or API) against `orders`/`payments` for that window:

- A captured payment with no matching `orders` row → the customer paid for something the restored DB doesn't know about. Recreate the order manually or refund them, and email them either way — don't leave it silent.
- An `orders` row marked `paid` with no matching Razorpay capture → shouldn't happen (payments are always verified before `markOrderPaid` runs), but check anyway.

## 6. Write down what happened

Before closing this out: what broke, when, how it was caught, how long the restore took, what data (if any) was actually lost. This is what the quarterly restore drill (below) checks against, and it's what improves the RPO/RTO numbers in docs/08 §16 over time instead of them staying a guess.

## Quarterly restore drill

Docs/10 §22 Phase 9 (backend hardening) exit criteria requires this to have actually been run once, not just written down. Do the drill into a scratch Supabase project or local Postgres — never the real staging/production project:

1. Grab the latest real backup (steps 1–3 above, decrypt and restore into a throwaway target).
2. Confirm row counts roughly match what you'd expect.
3. Run the Razorpay reconciliation comparison (step 5) against a known time window, confirm it produces no surprises.
4. Time the whole thing — that's the real RTO, not the estimate in docs/08 §16.
5. Update this runbook with anything that was unclear or wrong.

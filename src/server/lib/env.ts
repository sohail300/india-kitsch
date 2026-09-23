import "server-only";
import { z } from "zod";

/**
 * All environment variables the Next.js app reads at runtime, validated
 * once at import time so misconfiguration fails fast instead of surfacing
 * as a confusing error deep inside checkout or a webhook handler.
 *
 * `DATABASE_URL_SESSION`, `SUPABASE_URL`/`SUPABASE_ANON_KEY`, and the
 * backup-related `B2_*`/`BACKUP_AGE_PUBLIC_KEY`/`SENTRY_AUTH_TOKEN` vars
 * are deliberately NOT here — they belong to CI or the Cloudflare cron
 * Worker, never to this app. See docs/08-infrastructure-backups-ops.md §19.
 *
 * A handful of fields below are `.optional()` even though docs/08 §19
 * lists them as required-in-production, because the integration that
 * needs them hasn't been built yet (this file requires only what the
 * *currently built* app actually needs, matching docs/10's backend-first
 * phase order). Each one's comment says which phase tightens it back to
 * required — do that as part of building that phase, not before.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database — Supabase, transaction pooler (prepare: false; see docs/03 §11, docs/01 §2)
  DATABASE_URL: z.url(),

  // Auth (Better Auth)
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // Google sign-in is configured only if both are present (see auth.ts) —
  // required once Phase 3 (auth backend) actually wires up Google login.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Payments (Razorpay) — Phase 6 built checkout/payments, so the order-creation
  // credentials are required now. RAZORPAY_WEBHOOK_SECRET stays optional a
  // little longer: no Razorpay webhook is configured yet (owner hasn't set
  // one up), so there's no value to put here yet — tighten it the moment
  // one exists, since the webhook route is the payment source of truth
  // (docs/06 §9 step 5) and must never run unverified in production.
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1),

  // Site / public config
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_IMAGE_BASE_URL: z.url(),
  // Turnstile — required once Phase 3 wires up register/contact-form rate limiting.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET: z.string().min(1).optional(),

  // Email (Resend) — required once Phase 8 (email/notifications backend) sends anything.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email(),
  CONTACT_INBOX_EMAIL: z.email(),

  // Files (Cloudflare R2)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),

  // Cron (shared secret with the Cloudflare cron Worker)
  CRON_SECRET: z.string().min(16),

  // Monitoring — optional until Sentry is wired up in Phase 7
  SENTRY_DSN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * An unset env var and one left as `KEY=""` in `.env.local`/`.env.example`
 * should both count as "not configured yet" — without this, `.optional()`
 * only excuses a truly missing key, and an empty string still fails a
 * `.min(1)` check with a confusing error.
 */
function stripEmptyStrings(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === "" ? undefined : value;
  }
  return result;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(stripEmptyStrings(process.env));

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    console.error("Invalid environment variables:", fieldErrors);
    throw new Error(
      "Invalid environment variables — see the list above, and check .env.local against .env.example.",
    );
  }

  return parsed.data;
}

export const env = loadEnv();

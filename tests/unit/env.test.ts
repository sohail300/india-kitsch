import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:6543/postgres",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  RAZORPAY_KEY_SECRET: "key-secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_xxx",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_IMAGE_BASE_URL: "http://localhost:3000/images",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  TURNSTILE_SECRET: "turnstile-secret",
  RESEND_API_KEY: "re_xxx",
  EMAIL_FROM: "orders@example.com",
  CONTACT_INBOX_EMAIL: "hello@example.com",
  R2_ACCOUNT_ID: "r2-account-id",
  R2_ACCESS_KEY_ID: "r2-access-key",
  R2_SECRET_ACCESS_KEY: "r2-secret-key",
  R2_BUCKET: "ik-images",
  CRON_SECRET: "a-long-enough-cron-secret",
} as const;

function stubValidEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
    if (value === undefined) continue;
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env", () => {
  it("parses successfully when every required variable is set", async () => {
    stubValidEnv();
    const { env } = await import("@/server/lib/env");
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.CONTACT_INBOX_EMAIL).toBe(VALID_ENV.CONTACT_INBOX_EMAIL);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("throws a clear error when a required variable is missing", async () => {
    stubValidEnv();
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/server/lib/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("treats an optional field left as an empty string the same as absent (not an error)", async () => {
    // Regression test: .env.local/.env.example leave not-yet-built
    // integrations as `KEY=""`, not a missing key. `.optional()` alone
    // only excuses `undefined` — an empty string still fails `.min(1)`
    // unless it's normalized first. Covers Google/Razorpay/Turnstile/Resend.
    stubValidEnv({
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
      NEXT_PUBLIC_RAZORPAY_KEY_ID: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET: "",
      RESEND_API_KEY: "",
    });
    const { env } = await import("@/server/lib/env");
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RAZORPAY_KEY_SECRET).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("rejects an invalid URL", async () => {
    stubValidEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url" });
    await expect(import("@/server/lib/env")).rejects.toThrow();
  });

  it("rejects an invalid email address", async () => {
    stubValidEnv({ EMAIL_FROM: "not-an-email" });
    await expect(import("@/server/lib/env")).rejects.toThrow();
  });

  it("rejects a Better Auth secret shorter than 32 characters", async () => {
    stubValidEnv({ BETTER_AUTH_SECRET: "too-short" });
    await expect(import("@/server/lib/env")).rejects.toThrow();
  });
});

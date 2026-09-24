/**
 * Phase 9 secrets audit (docs/10 roadmap): confirms the logger's redaction
 * (docs/08 §21: "never secrets or full payloads") actually strips sensitive
 * fields rather than just being documented as doing so — including nested
 * objects, since context values are often a spread request/session shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/server/lib/logger";

describe("logger redaction", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function loggedLine(): Record<string, unknown> {
    const [line] = logSpy.mock.calls[0] as [string];
    return JSON.parse(line);
  }

  it("redacts top-level password/secret/token/cookie/apiKey-shaped keys", () => {
    logger.info("test", {
      password: "hunter2",
      RAZORPAY_KEY_SECRET: "sk_live_abc",
      accessToken: "tok_abc",
      Authorization: "Bearer xyz",
      cookie: "better-auth.session_token=abc",
      apiKey: "re_abc123",
      cvv: "123",
      safeField: "keep me",
    });

    const line = loggedLine();
    expect(line.password).toBe("[redacted]");
    expect(line.RAZORPAY_KEY_SECRET).toBe("[redacted]");
    expect(line.accessToken).toBe("[redacted]");
    expect(line.Authorization).toBe("[redacted]");
    expect(line.cookie).toBe("[redacted]");
    expect(line.apiKey).toBe("[redacted]");
    expect(line.cvv).toBe("[redacted]");
    expect(line.safeField).toBe("keep me");
  });

  it("redacts sensitive keys nested inside an object value", () => {
    logger.info("test", {
      request: { headers: { authorization: "Bearer xyz", accept: "application/json" } },
    });

    const line = loggedLine();
    const request = line.request as { headers: Record<string, unknown> };
    expect(request.headers.authorization).toBe("[redacted]");
    expect(request.headers.accept).toBe("application/json");
  });

  it("never lets an unredacted secret substring reach the log line", () => {
    logger.info("payment failed", { razorpayKeySecret: "sk_live_super_secret_value" });
    const [rawLine] = logSpy.mock.calls[0] as [string];
    expect(rawLine).not.toContain("sk_live_super_secret_value");
  });
});

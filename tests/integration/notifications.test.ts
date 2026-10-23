/**
 * Real integration test — the one place this project actually calls the
 * real Resend API (docs/09 §20's "verify against real infrastructure"
 * discipline), using Resend's own documented safe test address
 * (`delivered@resend.dev`, always accepted, never actually delivered to a
 * real inbox) so this can run in CI on every push without spamming anyone.
 * Every other test that touches order/payment functions injects a no-op
 * `EmailSender` instead — see payments.test.ts's/orders-admin.test.ts's
 * `mockEmailSender` — specifically so *they* don't hit this API.
 */
import { describe, expect, it } from "vitest";
import { emailSender } from "@/server/lib/email";
import { env } from "@/server/lib/env";
import { ResendClient } from "@/server/lib/resend";
import { verifyEmailTemplate } from "@/server/modules/notifications/templates/auth";

const RESEND_TEST_ADDRESS = "delivered@resend.dev";

describe("ResendClient", () => {
  it("sends a real email via the real Resend API and gets back an id", async () => {
    const client = new ResendClient({ apiKey: env.RESEND_API_KEY });
    const result = await client.sendEmail({
      from: env.EMAIL_FROM,
      to: RESEND_TEST_ADDRESS,
      subject: "India Kitsch — integration test",
      html: "<p>This is a real send from the test suite, to Resend's own always-safe test address.</p>",
      text: "This is a real send from the test suite, to Resend's own always-safe test address.",
    });
    expect(result.id).toBeTruthy();
  });

  it("rejects an invalid API key with a ResendApiError", async () => {
    const client = new ResendClient({ apiKey: "re_definitely_not_a_real_key" });
    await expect(
      client.sendEmail({
        from: env.EMAIL_FROM,
        to: RESEND_TEST_ADDRESS,
        subject: "x",
        html: "<p>x</p>",
        text: "x",
      }),
    ).rejects.toThrow(/Resend API error/);
  });
});

describe("emailSender singleton", () => {
  it("resolves to the real Resend-backed sender when RESEND_API_KEY is set, and can actually send", async () => {
    // Confirms the env-driven wiring in lib/email.ts, not just the client in isolation.
    expect(env.RESEND_API_KEY).toBeTruthy(); // this test only means something if a real key is configured
    const email = await verifyEmailTemplate(
      "Integration Test",
      "https://example.com/verify?token=test",
    );
    await expect(emailSender.send({ to: RESEND_TEST_ADDRESS, ...email })).resolves.toBeUndefined();
  });
});

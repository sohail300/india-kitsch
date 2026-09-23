import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/server/modules/payments/razorpay";

const SECRET = "test_secret_value";

function sign(payload: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyPaymentSignature", () => {
  it("accepts a correctly signed order/payment id pair", () => {
    const razorpayOrderId = "order_abc123";
    const razorpayPaymentId = "pay_xyz789";
    const signature = sign(`${razorpayOrderId}|${razorpayPaymentId}`);
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }, SECRET)).toBe(
      true,
    );
  });

  it("rejects a signature computed with the wrong secret", () => {
    const razorpayOrderId = "order_abc123";
    const razorpayPaymentId = "pay_xyz789";
    const signature = sign(`${razorpayOrderId}|${razorpayPaymentId}`, "wrong_secret");
    expect(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }, SECRET)).toBe(
      false,
    );
  });

  it("rejects a tampered payment id", () => {
    const razorpayOrderId = "order_abc123";
    const signature = sign(`${razorpayOrderId}|pay_original`);
    expect(
      verifyPaymentSignature(
        { razorpayOrderId, razorpayPaymentId: "pay_tampered", signature },
        SECRET,
      ),
    ).toBe(false);
  });

  it("rejects a signature of the wrong length instead of throwing", () => {
    expect(
      verifyPaymentSignature(
        { razorpayOrderId: "order_abc123", razorpayPaymentId: "pay_xyz789", signature: "short" },
        SECRET,
      ),
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(
      verifyPaymentSignature(
        { razorpayOrderId: "order_abc123", razorpayPaymentId: "pay_xyz789", signature: "" },
        SECRET,
      ),
    ).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed raw body", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { id: "pay_1" } });
    const signature = sign(rawBody);
    expect(verifyWebhookSignature({ rawBody, signature }, SECRET)).toBe(true);
  });

  it("rejects a body that doesn't match the signature (tampered payload)", () => {
    const originalBody = JSON.stringify({ event: "payment.captured", amount: 10000 });
    const signature = sign(originalBody);
    const tamperedBody = JSON.stringify({ event: "payment.captured", amount: 99999999 });
    expect(verifyWebhookSignature({ rawBody: tamperedBody, signature }, SECRET)).toBe(false);
  });

  it("rejects a signature signed with the wrong webhook secret", () => {
    const rawBody = "{}";
    const signature = sign(rawBody, "a_different_secret");
    expect(verifyWebhookSignature({ rawBody, signature }, SECRET)).toBe(false);
  });
});

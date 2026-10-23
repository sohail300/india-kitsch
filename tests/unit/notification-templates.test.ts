import { describe, expect, it } from "vitest";
import {
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/server/modules/notifications/templates/auth";
import {
  orderCancelledTemplate,
  orderConfirmationTemplate,
  orderRefundedTemplate,
  orderDeliveredTemplate,
  orderShippedTemplate,
} from "@/server/modules/notifications/templates/orders";
import type {
  OrderEmailAddress,
  OrderEmailLine,
  StoreContactInfo,
} from "@/server/modules/notifications/templates/orders";

const shipTo: OrderEmailAddress = {
  fullName: "Jane Doe",
  line1: "1 Test Street",
  line2: null,
  city: "Mumbai",
  state: "MH",
  pincode: "400001",
};

const lines: OrderEmailLine[] = [
  { productName: "Red Kurta", size: "M", color: "Red", quantity: 2, lineTotalPaise: 200000 },
];

const store: StoreContactInfo = {
  email: "hello@example.com",
  phone: null,
  addressLines: [],
  social: [],
};

const baseOrderFields = {
  subtotalPaise: 200000,
  shippingPaise: 9900,
  orderUrl: "https://example.com/account/orders/1042",
  store,
};

describe("verifyEmailTemplate / resetPasswordTemplate", () => {
  it("includes the verification link in both html and text", async () => {
    const result = await verifyEmailTemplate("Jane", "https://example.com/verify?token=abc");
    expect(result.html).toContain("https://example.com/verify?token=abc");
    expect(result.text).toContain("https://example.com/verify?token=abc");
    expect(result.subject).toMatch(/verify/i);
  });

  it("includes the reset link in both html and text", async () => {
    const result = await resetPasswordTemplate("Jane", "https://example.com/reset?token=abc");
    expect(result.html).toContain("https://example.com/reset?token=abc");
    expect(result.text).toContain("https://example.com/reset?token=abc");
  });

  it("HTML-escapes a name containing markup, in html but not text", async () => {
    const result = await verifyEmailTemplate(
      '<script>alert("x")</script>',
      "https://example.com/v",
    );
    expect(result.html).not.toContain("<script>alert");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.text).toContain('<script>alert("x")</script>'); // plain text is never HTML, nothing to escape
  });
});

describe("orderConfirmationTemplate", () => {
  it("includes the order number, total, line items, and shipping address", async () => {
    const result = await orderConfirmationTemplate({
      ...baseOrderFields,
      orderNumber: 1042,
      customerName: "Jane",
      totalPaise: 209900,
      lines,
      shipTo,
    });
    expect(result.subject).toContain("IK-1042");
    expect(result.html).toContain("Red Kurta");
    expect(result.html).toContain("₹2,099.00");
    expect(result.html).toContain("Mumbai");
    expect(result.text).toContain("Red Kurta");
    expect(result.text).toContain("₹2,099.00");
  });

  it("escapes product names in html", async () => {
    const result = await orderConfirmationTemplate({
      ...baseOrderFields,
      orderNumber: 1,
      customerName: "Jane",
      totalPaise: 1000,
      lines: [
        { productName: "<b>Evil</b>", size: "M", color: "Red", quantity: 1, lineTotalPaise: 1000 },
      ],
      shipTo,
    });
    expect(result.html).not.toContain("<b>Evil</b>");
    expect(result.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });
});

describe("orderDeliveredTemplate", () => {
  it("says it's delivered and links to the order", async () => {
    const result = await orderDeliveredTemplate({
      ...baseOrderFields,
      orderNumber: 1042,
      customerName: "Jane",
      totalPaise: 209900,
      paymentMethod: null,
      lines,
      shipTo,
    });
    expect(result.subject).toBe("Your order IK-1042 has been delivered");
    expect(result.html).toContain("https://example.com/account/orders/1042");
    expect(result.text).toContain("Delivered, Jane!");
  });
});

describe("orderShippedTemplate", () => {
  it("includes a tracking link when trackingUrl is set", async () => {
    const result = await orderShippedTemplate({
      ...baseOrderFields,
      orderNumber: 1042,
      customerName: "Jane",
      totalPaise: 209900,
      lines,
      shipTo,
      courier: "Delhivery",
      trackingNumber: "TRK123",
      trackingUrl: "https://track.example/TRK123",
    });
    expect(result.html).toContain('href="https://track.example/TRK123"');
    expect(result.html).toContain("Delhivery");
    expect(result.text).toContain("TRK123");
  });

  it("falls back to plain courier/tracking text when trackingUrl is null", async () => {
    const result = await orderShippedTemplate({
      ...baseOrderFields,
      orderNumber: 1042,
      customerName: "Jane",
      totalPaise: 209900,
      lines,
      shipTo,
      courier: "Delhivery",
      trackingNumber: "TRK123",
      trackingUrl: null,
    });
    expect(result.html).not.toContain("Track your package");
    expect(result.html).toContain("TRK123");
  });
});

describe("orderCancelledTemplate", () => {
  it("mentions the refund amount when refundedPaise > 0", async () => {
    const result = await orderCancelledTemplate({
      orderNumber: 1042,
      customerName: "Jane",
      reason: "customer request",
      refundedPaise: 209900,
    });
    expect(result.html).toContain("₹2,099.00");
    expect(result.text).toContain("₹2,099.00");
  });

  it("omits refund language when refundedPaise is 0", async () => {
    const result = await orderCancelledTemplate({
      orderNumber: 1042,
      customerName: "Jane",
      reason: "never paid",
      refundedPaise: 0,
    });
    expect(result.html).not.toContain("refunded");
    expect(result.text).not.toContain("refunded");
  });
});

describe("orderRefundedTemplate", () => {
  it("labels a full refund distinctly from a partial one", async () => {
    const full = await orderRefundedTemplate({
      orderNumber: 1042,
      customerName: "Jane",
      amountPaise: 209900,
      fullRefund: true,
    });
    expect(full.subject).not.toMatch(/partial/i);

    const partial = await orderRefundedTemplate({
      orderNumber: 1042,
      customerName: "Jane",
      amountPaise: 50000,
      fullRefund: false,
    });
    expect(partial.subject).toMatch(/partial/i);
    expect(partial.html).toContain("partial refund");
  });
});

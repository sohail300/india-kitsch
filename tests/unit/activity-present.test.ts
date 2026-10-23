import { describe, expect, it } from "vitest";
import {
  actionLabel,
  describeChanges,
  formatValue,
  summarizeEntry,
} from "@/app/admin/(dashboard)/activity/present";

const ctx = { categoryNames: new Map([["cat1", "Mugs"]]) };

describe("actionLabel", () => {
  it("words known actions and falls back to the raw name", () => {
    expect(actionLabel("product.update")).toBe("Edited product");
    expect(actionLabel("something.new")).toBe("something.new");
  });
});

describe("formatValue", () => {
  it("formats money, rates, booleans, blanks, categories and statuses", () => {
    expect(formatValue("pricePaise", 49900, ctx)).toBe("₹499.00");
    expect(formatValue("gstRateBps", 1200, ctx)).toBe("12%");
    expect(formatValue("isActive", false, ctx)).toBe("No");
    expect(formatValue("description", null, ctx)).toBe("—");
    expect(formatValue("description", "", ctx)).toBe("—");
    expect(formatValue("categoryId", "cat1", ctx)).toBe("Mugs");
    expect(formatValue("categoryId", "gone", ctx)).toBe("Deleted category");
    expect(formatValue("status", "processing", ctx)).toBe("Processing");
    expect(formatValue("status", "draft", ctx)).toBe("Draft");
    expect(formatValue("delta", 5, ctx)).toBe("+5");
    expect(formatValue("delta", -3, ctx)).toBe("-3");
    expect(formatValue("orderedCategoryIds", ["a", "b"], ctx)).toBe("2 items");
  });
});

describe("describeChanges", () => {
  const before = {
    id: "p1",
    name: "Mug",
    pricePaise: 49900,
    isActive: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  it("lists only fields that changed, ignoring bookkeeping columns", () => {
    const after = { ...before, pricePaise: 54900, updatedAt: "2026-09-02T00:00:00.000Z" };
    expect(describeChanges("product", before, after, ctx)).toEqual([
      { label: "Price", before: "₹499.00", after: "₹549.00" },
    ]);
  });

  it("uses the item-specific label where one exists", () => {
    const after = { ...before, isActive: false };
    expect(describeChanges("category", before, after, ctx)).toEqual([
      { label: "Visible", before: "Yes", after: "No" },
    ]);
  });

  it("lists every field with one side only for a create or delete", () => {
    const changes = describeChanges("product", null, before, ctx);
    expect(changes.map((c) => c.label)).toEqual(["Name", "Price", "Active"]);
    expect(changes.every((c) => c.before === null)).toBe(true);
  });
});

describe("summarizeEntry", () => {
  it("summarises an edit as the first two changes plus a count", () => {
    const before = { name: "Mug", pricePaise: 49900, hsnCode: "1", seoTitle: "a" };
    const after = { name: "Big mug", pricePaise: 54900, hsnCode: "2", seoTitle: "a" };
    expect(summarizeEntry("product.update", "product", before, after, ctx)).toBe(
      "Name: Mug → Big mug; Price: ₹499.00 → ₹549.00; +1 more",
    );
  });

  it("has dedicated wording for stock, refunds, cancels and shipping", () => {
    expect(
      summarizeEntry(
        "inventory.adjust",
        "inventory",
        null,
        { delta: 5, reason: "restock", note: null, newOnHand: 14 },
        ctx,
      ),
    ).toBe("+5 · Restock · In hand 14");
    expect(
      summarizeEntry(
        "inventory.adjust",
        "inventory",
        null,
        { delta: -2, reason: "adjustment", note: "Damaged or defective", newOnHand: 12 },
        ctx,
      ),
    ).toBe("-2 · Damaged or defective · In hand 12");
    expect(
      summarizeEntry("order.refund", "order", null, { amountPaise: 10000, fullRefund: false }, ctx),
    ).toBe("₹100.00 (partial)");
    expect(
      summarizeEntry(
        "order.cancelPaid",
        "order",
        { status: "paid" },
        { status: "cancelled", refundedAmountPaise: 165226, reason: "x" },
        ctx,
      ),
    ).toBe("Refunded ₹1,652.26");
    expect(
      summarizeEntry(
        "order.markShipped",
        "order",
        { status: "processing" },
        { status: "shipped", courier: "Delhivery", trackingNumber: "123" },
        ctx,
      ),
    ).toBe("Delhivery · 123");
  });

  it("is empty for a create or delete — the Item column names it", () => {
    expect(summarizeEntry("product.create", "product", null, { name: "Mug" }, ctx)).toBe("");
    expect(summarizeEntry("product.delete", "product", { name: "Mug" }, null, ctx)).toBe("");
  });
});

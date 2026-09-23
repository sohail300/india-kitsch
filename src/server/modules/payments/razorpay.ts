import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/lib/env";

/**
 * A thin, hand-written Razorpay REST client rather than the official SDK —
 * `fetchImpl` is injectable so tests can intercept every call instead of
 * hitting the real API (docs/09 §20: "Razorpay: HTTP layer mocked with
 * recorded fixtures in CI"), and INR's smallest unit (paise) already
 * matches Razorpay's expected `amount` unit, so no conversion happens here.
 */

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number;
  currency: string;
  method: string | null;
  error_code: string | null;
  error_description: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export class RazorpayApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Razorpay API error (${status}): ${JSON.stringify(body)}`);
    this.name = "RazorpayApiError";
  }
}

export interface RazorpayClientConfig {
  keyId: string;
  keySecret: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export class RazorpayClient {
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(config: RazorpayClientConfig) {
    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl ?? RAZORPAY_API_BASE_URL;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new RazorpayApiError(response.status, body);
    }
    return body as T;
  }

  async createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(`/payments/${paymentId}`);
  }

  /** Every payment attempt against a Razorpay order — the reconciler's "ask Razorpay whether a captured payment exists" step (docs/06 §9 step 7). */
  async fetchOrderPayments(razorpayOrderId: string): Promise<{ items: RazorpayPayment[] }> {
    return this.request<{ items: RazorpayPayment[] }>(`/orders/${razorpayOrderId}/payments`);
  }

  /** Omitting amountPaise refunds in full. */
  async createRefund(
    paymentId: string,
    input: { amountPaise?: number; notes?: Record<string, string> } = {},
  ): Promise<RazorpayRefund> {
    return this.request<RazorpayRefund>(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: input.amountPaise, notes: input.notes }),
    });
  }
}

/** The real client, built from env vars — pass `fetchImpl` only in tests. */
export function createRazorpayClient(fetchImpl?: typeof fetch): RazorpayClient {
  return new RazorpayClient({
    keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    fetchImpl,
  });
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Equal-length check first: timingSafeEqual throws (not returns false) on a length mismatch, and the length itself isn't a secret worth constant-timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** docs/06 §9 step 4: the client-side verify fast-path's signature — HMAC_SHA256(orderId + "|" + paymentId, KEY_SECRET). */
export function verifyPaymentSignature(
  input: { razorpayOrderId: string; razorpayPaymentId: string; signature: string },
  keySecret: string,
): boolean {
  const expected = hmacHex(`${input.razorpayOrderId}|${input.razorpayPaymentId}`, keySecret);
  return constantTimeEqual(expected, input.signature);
}

/** docs/06 §9 step 5: HMAC-SHA256 of the *raw* webhook body — must be computed on the exact bytes received, before any JSON parsing. */
export function verifyWebhookSignature(
  input: { rawBody: string; signature: string },
  webhookSecret: string,
): boolean {
  const expected = hmacHex(input.rawBody, webhookSecret);
  return constantTimeEqual(expected, input.signature);
}

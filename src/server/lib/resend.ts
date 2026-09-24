/**
 * A thin, hand-written Resend REST client — same reasoning as
 * payments/razorpay.ts: `fetchImpl` is injectable so tests can intercept
 * every call, and it avoids an extra SDK dependency for what's a single
 * simple endpoint. No `import "server-only"` — this has to stay importable
 * from server/lib/email.ts, which in turn must stay importable from
 * server/auth/config.ts (unguarded, for scripts/create-admin.ts under
 * plain tsx).
 */

const RESEND_API_BASE_URL = "https://api.resend.com";

export interface ResendSendInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface ResendSendResult {
  id: string;
}

export class ResendApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Resend API error (${status}): ${JSON.stringify(body)}`);
    this.name = "ResendApiError";
  }
}

export interface ResendClientConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export class ResendClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(config: ResendClientConfig) {
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl ?? RESEND_API_BASE_URL;
  }

  async sendEmail(input: ResendSendInput): Promise<ResendSendResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ResendApiError(response.status, body);
    }
    return body as ResendSendResult;
  }
}

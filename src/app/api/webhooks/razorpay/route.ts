import { handleRazorpayWebhook } from "@/server/modules/payments/webhook";

/**
 * The Razorpay payment source of truth (docs/06 §9 step 5). Reads the
 * *raw* body - signature verification must run on the exact bytes
 * received, before any JSON parsing - and does no business logic itself,
 * that all lives in handleRazorpayWebhook so it's directly unit/integration
 * testable without an HTTP layer.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleRazorpayWebhook({
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventId: request.headers.get("x-razorpay-event-id"),
  });

  return Response.json({ outcome: result.outcome }, { status: result.status });
}

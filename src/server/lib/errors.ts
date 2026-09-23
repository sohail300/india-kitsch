/**
 * Typed errors for *expected* failure modes deep in the service layer
 * (out of stock, not found, ...). Per docs/05 §6, low-level functions throw
 * these — inside a DB transaction, throwing is what triggers rollback — and
 * the calling Server Action/route maps them to a `{ ok: false, code,
 * message }` result. Anything NOT thrown as one of these is a bug, not an
 * expected outcome, and is left to propagate to error.tsx / Sentry.
 */

export abstract class AppError extends Error {
  abstract readonly code: string;
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  constructor(subject: string) {
    super(`${subject} not found`);
    this.name = "NotFoundError";
  }
}

export class OutOfStockError extends AppError {
  readonly code = "OUT_OF_STOCK";
  constructor(readonly variantId: string) {
    super(`Insufficient available stock for variant ${variantId}`);
    this.name = "OutOfStockError";
  }
}

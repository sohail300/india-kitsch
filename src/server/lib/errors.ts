/**
 * Typed errors for *expected* failure modes deep in the service layer
 * (out of stock, not found, ...). Per docs/05 §6, low-level functions throw
 * these - inside a DB transaction, throwing is what triggers rollback - and
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

/**
 * A category can only be deleted while it has no products - products are
 * moved or deleted first, never removed as a side effect (docs/07 §13).
 */
export class CategoryNotEmptyError extends AppError {
  readonly code = "CATEGORY_NOT_EMPTY";
  constructor(
    readonly categoryName: string,
    readonly productCount: number,
  ) {
    super(
      `${categoryName} still has ${productCount} ${productCount === 1 ? "product" : "products"} - move or delete them first`,
    );
    this.name = "CategoryNotEmptyError";
  }
}

/**
 * A product can only be deleted if it has never been ordered — order history
 * must keep pointing at real products. Archive it instead.
 */
export class ProductHasOrdersError extends AppError {
  readonly code = "PRODUCT_HAS_ORDERS";
  constructor(readonly productName: string) {
    super(`${productName} has been ordered, so it can't be deleted — archive it instead`);
    this.name = "ProductHasOrdersError";
  }
}

/**
 * A size & colour can't be deleted once it has been ordered (order history
 * points at it) or while units are held in a checkout — pause it instead.
 */
export class VariantNotDeletableError extends AppError {
  readonly code = "VARIANT_NOT_DELETABLE";
  constructor(message: string) {
    super(message);
    this.name = "VariantNotDeletableError";
  }
}

export class OutOfStockError extends AppError {
  readonly code = "OUT_OF_STOCK";
  constructor(readonly variantId: string) {
    super(`Insufficient available stock for variant ${variantId}`);
    this.name = "OutOfStockError";
  }
}

/**
 * Thrown only by the atomic conditional-UPDATE redemption (coupons/service.ts)
 * when a concurrent race exhausts `maxUses` between the caller's earlier
 * validate.ts preview and the actual redemption - validate.ts itself
 * returns a structured `{ ok: false, code }` result, it never throws.
 */
export class CouponExhaustedError extends AppError {
  readonly code = "COUPON_EXHAUSTED";
  constructor(readonly couponCode: string) {
    super(`Coupon ${couponCode} has reached its usage limit`);
    this.name = "CouponExhaustedError";
  }
}

/**
 * Thrown by orders/stateMachine.ts's `transition()` when the requested
 * (from, to) pair isn't a legal edge in docs/06 §10's table - a programmer
 * error (calling code attempted something the state machine never allows),
 * not a concurrency race. A race (someone else changed the order first) is
 * a *legal* transition that just lost an optimistic-concurrency check -
 * `transition()` returns `null` for that, it doesn't throw.
 */
export class InvalidOrderTransitionError extends AppError {
  readonly code = "INVALID_ORDER_TRANSITION";
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal order status transition: ${from} -> ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

import "server-only";
import { auth } from "./auth";

/**
 * The Data Access Layer for authentication (docs/04 §5): "Authorization
 * lives in the Data Access Layer, not in proxy.ts or layouts... requireUser()
 * / requireAdmin() are called at the top of every protected page, Server
 * Action and Route Handler." No other code should call `auth.api.getSession`
 * directly - go through these so the disabled-account and role checks are
 * never accidentally skipped.
 */

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Returns the session, or `null` if there isn't one. Never throws for "no session". */
export async function getSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  return session ?? null;
}

/** Throws UnauthorizedError if there's no session or the account is disabled. */
export async function requireUser(headers: Headers): Promise<Session> {
  const session = await getSession(headers);
  if (!session) throw new UnauthorizedError();
  if (session.user.disabled) throw new UnauthorizedError("This account has been disabled");
  return session;
}

/**
 * Throws UnauthorizedError/ForbiddenError unless the caller is a signed-in,
 * non-disabled admin. Every admin route/action/page must call this - the
 * role check happens here, once, never by trusting anything the client sent
 * (docs/04 §5, §14).
 */
export async function requireAdmin(headers: Headers): Promise<Session> {
  const session = await requireUser(headers);
  if (session.user.role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }
  return session;
}

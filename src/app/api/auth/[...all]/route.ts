import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

/**
 * Mounts every Better Auth endpoint (sign-up, sign-in, sign-out, session,
 * verification, reset, 2FA, ...) at /api/auth/*. See docs/02 §3.
 */
export const { GET, POST } = toNextJsHandler(auth);

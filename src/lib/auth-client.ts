"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. No baseURL override - same-origin, so
 * the default (current origin) is correct in every environment (docs/04 §5).
 */
export const authClient = createAuthClient({});

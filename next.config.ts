import type { NextConfig } from "next";

// Reads process.env directly rather than importing the Zod-validated
// server/lib/env.ts: that module validates every server secret (DB,
// Razorpay, Resend, R2, ...) at import time, which next.config.ts should
// not be coupled to just to read one public URL for the CSP's img-src.
const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
const imageOrigin = imageBaseUrl ? new URL(imageBaseUrl).origin : "";
const isDev = process.env.NODE_ENV === "development";

// docs/04-auth-and-security.md §14: "strict CSP allowing only self,
// checkout.razorpay.com, api.razorpay.com (frame + connect),
// lumberjack.razorpay.com, img.<domain>, Turnstile; ... frame-ancestors
// 'none' ...". No nonce/proxy — this app has no inline scripts of its own
// to selectively allow, so the plain next.config.ts `headers()` approach
// from the Next CSP guide's "Without Nonces" section applies; 'unsafe-inline'
// on script/style is what that guide's own non-nonce example uses, needed
// for Next's own inline hydration/style tags.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:${imageOrigin ? ` ${imageOrigin}` : ""};
  font-src 'self';
  connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com;
  frame-src https://checkout.razorpay.com https://api.razorpay.com https://challenges.cloudflare.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  // Phase 0 item 8 (docs/12): confirmed working — see
  // docs/05-server-catalog-cart-performance.md §7 for the evidence.
  cacheComponents: true,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 0 item 8 (docs/12): confirmed working — see
  // docs/05-server-catalog-cart-performance.md §7 for the evidence.
  cacheComponents: true,
};

export default nextConfig;

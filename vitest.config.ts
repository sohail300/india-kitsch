import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Unlike Next.js/tsx, Vitest doesn't auto-load .env.local — without
    // this, any test importing the real env.ts (e.g. via db/client.ts,
    // auth.ts) fails with "Invalid environment variables" even when
    // .env.local is genuinely correct. Needed by tests/integration/*,
    // which run against the real Supabase project, not stubbed env vars.
    setupFiles: ["./tests/setup/load-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See tests/setup/server-only-stub.ts for why.
      "server-only": path.resolve(__dirname, "./tests/setup/server-only-stub.ts"),
    },
  },
});

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turns off stylistic ESLint rules that would otherwise conflict with
  // Prettier's formatting; keep this last so it can override the rest.
  eslintConfigPrettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    // Its own separate project (own tsconfig, own package.json, own
    // Workers-specific globals) — not part of the Next.js app.
    "cron-worker/**",
  ]),
]);

export default eslintConfig;

// Vitest doesn't get Next.js's special webpack handling of the real
// `server-only` package (which is what actually enforces "can't be
// imported from a Client Component" — see next.config docs). Aliased in
// vitest.config.ts so `import "server-only"` is a no-op under tests;
// production builds still go through the real package and its guard.
export {};

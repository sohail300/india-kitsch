// Vitest setup file — loads .env.local the way Next.js/tsx do automatically
// but Vitest doesn't. See vitest.config.ts for why this is needed.
import { config } from "dotenv";

config({ path: ".env.local" });

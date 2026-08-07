// Loaded before every test file (see vitest.config.ts's setupFiles) — points
// DATABASE_URL at the dedicated test database instead of whatever .env has,
// so integration tests never touch the real dev database.
import { config } from "dotenv";

config({ path: ".env.test", override: true });

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setupEnv.ts"],
    // Integration tests share one real Postgres test database and reset it
    // via TRUNCATE in beforeEach — running test files in parallel would let
    // one file's reset truncate rows another file's test is still using.
    fileParallelism: false,
  },
});

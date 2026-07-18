import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["db/**/*.test.ts"],
    maxWorkers: 1,
    pool: "threads",
    restoreMocks: true,
    unstubEnvs: true,
    // Cold Miniflare starts can hydrate workerd and its native dependencies on
    // a new machine. The assertions themselves remain sub-second.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});

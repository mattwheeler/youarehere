import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "components/**/*.test.tsx",
      "lib/**/*.test.ts",
    ],
    exclude: [...configDefaults.exclude, "db/**/*.test.ts"],
    maxWorkers: 1,
    pool: "threads",
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "app/api/**/*.ts",
        "components/**/*.tsx",
        "lib/**/*.ts",
      ],
      exclude: ["**/*.test.*"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});

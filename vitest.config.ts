import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "functions/**/*.test.ts"],
    testTimeout: 20000,
  },
});

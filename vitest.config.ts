import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "checks/unit/**/*.test.ts", "app/src/charts/**/*.test.tsx", "app/src/editors/sheet/**/*.test.tsx", "app/src/editors/document/**/*.test.tsx", "app/src/editors/deck/**/*.test.tsx", "app/src/features/agents/**/*.test.ts", "app/src/features/editing/**/*.test.tsx"],
    environment: "node",
  },
});

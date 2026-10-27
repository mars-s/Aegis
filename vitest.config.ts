import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "checks/unit/**/*.test.ts", "app/src/charts/**/*.test.tsx", "app/src/editors/sheet/**/*.test.tsx"],
    environment: "node",
  },
});

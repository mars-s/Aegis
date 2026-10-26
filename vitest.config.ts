import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "checks/unit/**/*.test.ts"],
    environment: "node",
  },
});

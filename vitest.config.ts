import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "checks/unit/**/*.test.ts", "app/src/**/*.test.ts", "app/src/**/*.test.tsx"],
    // Real host and browser fixtures share the machine across worktrees.
    maxWorkers: 2,
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run each test file in its own fork process, sequentially. This keeps peak
    // memory bounded (jsdom suites don't accumulate in one worker) and avoids the
    // OOM that occurs when many test files run concurrently in a shared worker.
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "clover"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/test/**",
        "src/**/*.d.ts",
        "src/styles/**",
      ],
    },
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest's default glob also matches *.spec.ts, which collides with the
    // Playwright e2e suite in e2e/ (different test runner, incompatible API).
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});

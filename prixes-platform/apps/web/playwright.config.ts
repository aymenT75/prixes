import { defineConfig, devices } from "@playwright/test";

// E2E covers unauthenticated "golden path" flows only: login goes through
// Firebase Auth directly from the browser (see AuthModal.tsx), and there is no
// Firebase test project wired into CI, so any real login can't be automated
// here yet. See apps/web/e2e/README.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Skipped when E2E_BASE_URL is set (e.g. pointing at an already-running
  // stack, or a deployed environment) — only auto-starts `next dev` locally.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // .env.local may point NEXT_PUBLIC_API_BASE_URL at a LAN IP for on-device
        // testing (see MOBILE.md) — override it here so e2e always talks to the
        // API over loopback, regardless of the developer's local override.
        env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000" },
      },
});

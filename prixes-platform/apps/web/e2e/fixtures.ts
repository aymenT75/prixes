import { test as base } from "@playwright/test";

// Every fresh browser context looks like a brand-new visitor to the app, which
// triggers the full-screen guided tour overlay (see lib/useTour.ts) on the
// first "/" navigation. That's correct product behaviour, but it isn't what
// these golden-path tests are checking, and the overlay sits on top of (and
// hides) the very content the tests assert on. Mark the tour as already seen
// before any navigation happens, exactly like a returning user.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("prixes.tour.seen", "1");
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";

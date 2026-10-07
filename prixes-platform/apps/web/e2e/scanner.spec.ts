import { expect, test } from "./fixtures";

// The scanner was replaced by the "Magasins" tab (2026-10-07): old links to
// /scanner must land somewhere useful, and the tab must be there.
test.describe("Magasins (replaces the scanner)", () => {
  test("the bottom bar offers Magasins and /scanner leads there", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(nav.getByRole("link", { name: /Magasins/ })).toBeVisible();
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/stores/);
  });
});

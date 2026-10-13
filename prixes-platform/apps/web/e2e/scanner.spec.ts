import { expect, test } from "./fixtures";

// The scanner became "Magasins" (2026-10-07), then "Menus" took that tab
// (2026-10-13): old links to /scanner still land on the shops page.
test.describe("Menus tab (replaces Magasins)", () => {
  test("the bottom bar offers Menus and /scanner still leads to the shops", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(nav.getByRole("link", { name: /Menus/ })).toBeVisible();
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/stores/);
  });
});

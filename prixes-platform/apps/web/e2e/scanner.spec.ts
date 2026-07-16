import { expect, test } from "./fixtures";

test.describe("Scanner (manual barcode entry — no camera required)", () => {
  test("page renders without a camera and manual entry navigates to product detail", async ({
    page,
  }) => {
    // No camera permission granted — this is the realistic case for most CI/
    // headless runs, and the manual-entry fallback must work regardless.
    await page.goto("/scanner");
    await expect(page.getByPlaceholder("Saisir un code-barres")).toBeVisible();

    await page.getByPlaceholder("Saisir un code-barres").fill("3017760000011");
    await page.getByRole("button", { name: "Chercher" }).click();

    await expect(page).toHaveURL(/\/courses\/detail\?barcode=3017760000011/);
  });
});

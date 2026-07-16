import { expect, test } from "./fixtures";

test.describe("Stores (geolocation fallback — RGPD requirement)", () => {
  test("declining geolocation reveals the manual-address fallback", async ({ page, context }) => {
    // No permission granted → the browser's geolocation prompt auto-denies,
    // exercising the exact path RGPD module 3 added: geolocation must never be
    // the only way to use this feature.
    await context.clearPermissions();
    await page.goto("/stores");

    await expect(page.getByRole("heading", { name: "Magasins proches" })).toBeVisible();
    await page.getByRole("button", { name: "Utiliser ma position" }).click();

    await expect(page.getByText("Position refusée. Activez la localisation.")).toBeVisible();
    await expect(page.getByLabel("Votre ville ou adresse")).toBeVisible();
  });

  test("manual address entry can also be opened directly", async ({ page }) => {
    await page.goto("/stores");
    await page.getByRole("button", { name: "Ou saisir une adresse" }).click();
    await expect(page.getByLabel("Votre ville ou adresse")).toBeVisible();
  });
});

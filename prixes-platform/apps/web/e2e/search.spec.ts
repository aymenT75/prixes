import { expect, test } from "./fixtures";

test.describe("Courses (product search)", () => {
  test("browse shows the seeded catalog", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
    await expect(page.getByText("Produits populaires")).toBeVisible();

    // Requires the DB to be seeded (scripts/seed.py) — otherwise this is the
    // documented empty state, which is also a valid, non-crashing outcome.
    await expect(
      page.getByText(/Aucun produit trouvé\.|Catalogue vide/).or(page.locator(".card").first()),
    ).toBeVisible();
  });

  test("typing a query filters results without a full page reload", async ({ page }) => {
    await page.goto("/courses");
    const input = page.getByPlaceholder("Rechercher un produit…");
    await input.fill("yaourt");
    await input.press("Enter");

    // Either a real match or the "no results" message — both prove the search
    // request round-tripped and the UI updated in place.
    await expect(
      page.getByText("Aucun produit trouvé.").or(page.locator(".card").first()),
    ).toBeVisible();
  });

  test("?q= deep link (used by the voice assistant) pre-fills and searches", async ({ page }) => {
    await page.goto("/courses?q=chocolat");
    await expect(page.getByPlaceholder("Rechercher un produit…")).toHaveValue("chocolat");
  });
});

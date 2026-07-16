import { expect, test } from "./fixtures";

test.describe("Home page (golden path)", () => {
  test("loads with hero, search, and tool shortcuts", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Prixes", exact: true })).toBeVisible();
    await expect(page.getByText("Ne payez jamais le prix fort")).toBeVisible();

    // Greeting + search are always present, even signed out.
    await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
    await expect(page.getByRole("search")).toBeVisible();

    // The 4 quick-access tools from the redesign.
    for (const label of ["Ma liste", "Alertes", "Magasins", "Mon avis"]) {
      await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }
  });

  test("searching from home navigates to Courses with the query", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Rechercher un produit").fill("yaourt");
    await page.getByLabel("Rechercher un produit").press("Enter");

    await expect(page).toHaveURL(/\/courses\?q=yaourt/);
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  });
});

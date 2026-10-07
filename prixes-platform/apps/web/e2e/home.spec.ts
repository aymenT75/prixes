import { expect, test } from "./fixtures";

test.describe("Home page (golden path)", () => {
  test("loads with the voice hero, search, and tool shortcuts", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Prixes", exact: true })).toBeVisible();
    // The voice-first hero: the Caddie, the question, and examples to tap.
    await expect(page.getByRole("heading", { name: "Que voulez-vous faire ?" })).toBeVisible();
    for (const example of ["Une raclette pour 6", "Essence la moins chère", "Compose mon menu"]) {
      await expect(page.getByRole("button", { name: `« ${example} »` }).first()).toBeVisible();
    }

    // Greeting + search are always present, even signed out.
    await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
    await expect(page.getByRole("search")).toBeVisible();

    // The 4 quick-access tools from the redesign.
    for (const label of ["Ma liste", "Alertes", "Magasins", "Mon avis"]) {
      await expect(page.locator("main").getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }
  });

  test("there is exactly one microphone, and it opens the assistant", async ({ page }) => {
    // Several mics that all did the same thing were announced four times by a
    // screen reader. One, in the centre of the tab bar, on every page.
    await page.goto("/");
    const mic = page.getByRole("button", { name: /Parler à Prixes/ });
    await expect(mic).toHaveCount(1);
    await mic.click();
    await expect(page.getByRole("dialog", { name: "Assistant vocal Prixes" })).toBeVisible();
  });

  test("searching from home opens the search with the query", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Rechercher un produit").fill("yaourt");
    await page.getByLabel("Rechercher un produit").press("Enter");

    await expect(page).toHaveURL(/\/courses\?q=yaourt/);
    await expect(page.getByRole("heading", { name: "Recherche" })).toBeVisible();
  });
});

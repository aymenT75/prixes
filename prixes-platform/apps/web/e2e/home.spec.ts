import { expect, test } from "./fixtures";

test.describe("Home page (golden path)", () => {
  test("greets, asks where to shop today, and keeps the search", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Prixes", exact: true })).toBeVisible();
    // The question the home page answers before it is asked.
    await expect(page.getByRole("heading", { name: /Bonjour.*où fait-on nos courses aujourd/ })).toBeVisible();
    // Signed out, the assistant offers to listen or to sign in.
    await expect(page.getByRole("region", { name: "Votre prochaine course" })).toBeVisible();
    await expect(page.getByRole("search")).toBeVisible();
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

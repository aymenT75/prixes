import { expect, test } from "./fixtures";

test.describe("Home (three big buttons)", () => {
  test("greets and offers Parler, Ma liste and Où aller, nothing else", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Bonjour.*que voulez-vous faire/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Parler" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ma liste/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Où aller/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Réglages" })).toBeVisible();
    // No tab bar, no search: one thing to do at a time.
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
    await expect(page.getByRole("search")).toHaveCount(0);
  });

  test("every touch target on the home screen is at least 64 px tall", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const heights = await page
      .locator("main a, main button")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThanOrEqual(4);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(64);
  });

  test("Parler opens the assistant, and a request can be typed instead of spoken", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Parler" }).click();
    const dialog = page.getByRole("dialog", { name: "Assistant vocal Prixes" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Ou écrivez ici").fill("aide");
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(dialog.getByText(/Vous pouvez dire/)).toBeVisible();
    await dialog.getByRole("button", { name: "Fermer l'assistant" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("Ma liste and Où aller ask to sign in, with one big button", async ({ page }) => {
    for (const path of ["/list", "/ou-aller"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
    }
  });

  test("Réglages keeps the theme, the voice and the allergies", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
    const night = page.getByRole("switch", { name: /Thème Nuit/ });
    await night.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await night.click();
    await expect(page.getByRole("switch", { name: /Lire les écrans/ })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "gluten" })).toBeVisible();
  });
});

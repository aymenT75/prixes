import { expect, test } from "./fixtures";

test("privacy policy page renders and is reachable from the account page", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Confidentialité" })).toBeVisible();
  await expect(page.getByText("Ce qu'on collecte, et pourquoi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
});

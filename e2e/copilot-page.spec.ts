import { expect, test } from "@playwright/test";

const credentials = {
  email: process.env.E2E_EMAIL ?? "admin@fleg.local",
  password: process.env.E2E_PASSWORD ?? "FlegDemo!2026",
};

test("AI-01 ouvre le Copilote avec une configuration serveur valide", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in");
  await page.getByLabel("Adresse e-mail").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/stores$/);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const copilotLink =
    testInfo.project.name === "mobile-390"
      ? page.getByRole("link", { name: "Ouvrir le Copilote analytique" })
      : page.getByRole("link", { name: "Copilote", exact: true });

  await copilotLink.click();

  await expect(page).toHaveURL(/\/copilot$/);
  await expect(
    page.getByRole("heading", { name: "Copilote analytique" }),
  ).toBeVisible();
  await expect(page.getByText("Configuration serveur invalide")).toBeHidden();
});

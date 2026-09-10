import { expect, test } from "@playwright/test";

import { selectPrimaryDemoStore } from "./demo-store";

test("DOC-01 rend le guide métier consultable dans l’application", async ({
  page,
}, testInfo) => {
  await page.goto("/stores");
  await selectPrimaryDemoStore(page);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const helpLink =
    testInfo.project.name === "mobile-390"
      ? page.getByRole("link", {
          name: "Ouvrir l’aide et le guide utilisateur",
        })
      : page.getByRole("link", { name: "Aide", exact: true });
  await helpLink.click();

  await expect(page).toHaveURL(/\/help$/);
  await expect(
    page.getByRole("heading", { name: "Aide et guide utilisateur" }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Rechercher dans le guide utilisateur",
  });
  await search.fill("colisage");
  await expect(page.getByText("2 chapitre(s) disponible(s)")).toBeVisible();

  await page
    .getByRole("link")
    .filter({ hasText: "Glossaire et dépannage" })
    .click();
  await expect(page).toHaveURL(/\/help\/glossary-troubleshooting$/);
  await expect(
    page.getByRole("heading", { name: "Glossaire et dépannage" }),
  ).toBeVisible();
  await expect(page.getByText("Colisage", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Nombre de kilogrammes ou de pièces contenus dans un colis/),
  ).toBeVisible();
});

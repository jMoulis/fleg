import { expect, test } from "@playwright/test";

import { selectPrimaryDemoStore } from "./demo-store";

test("AI-01 ouvre le Copilote avec une configuration serveur valide", async ({
  page,
}, testInfo) => {
  await page.goto("/stores");
  await expect(page).toHaveURL(/\/stores$/);
  await selectPrimaryDemoStore(page);
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

import { expect, test } from "@playwright/test";

import { storeCopilotResponseSchema } from "@/domain/ai/copilot";

const credentials = {
  email: process.env.E2E_EMAIL ?? "admin@fleg.local",
  password: process.env.E2E_PASSWORD ?? "FlegDemo!2026",
};

test.skip(
  process.env.RUN_LIVE_AI_E2E !== "true",
  "La recette IA réelle reste opt-in afin de maîtriser coût et variabilité.",
);

test("AI-02 répond avec des preuves après plusieurs appels d’outils", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Adresse e-mail").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/stores$/);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Copilote", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Copilote analytique" }),
  ).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/ai/chat") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page
    .getByRole("button", {
      name: "Quels produits devrais-je prioriser le mois prochain ?",
    })
    .click();
  const response = await responsePromise;
  const payload: unknown = await response.json();

  expect(response.status()).toBe(200);
  const result = storeCopilotResponseSchema.parse(payload);
  expect(result.answer.length).toBeGreaterThan(20);
  expect(result.toolCalls.length).toBeGreaterThan(0);
  await expect(page.getByText("Réponse indisponible")).toBeHidden();
  await expect(page.getByRole("log")).toContainText(result.answer);
});

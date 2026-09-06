import { expect, test } from "@playwright/test";

import { aiActionPlanDecisionResponseSchema } from "@/domain/ai/action-plans";
import { storeCopilotResponseSchema } from "@/domain/ai/copilot";

test.skip(
  process.env.RUN_LIVE_AI_E2E !== "true",
  "La recette IA réelle reste opt-in afin de maîtriser coût et variabilité.",
);

test("AI-02 répond avec des preuves après plusieurs appels d’outils", async ({
  page,
}) => {
  await page.goto("/stores");
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

test("AI-03 crée un brouillon fondé sur des preuves puis exige une décision", async ({
  page,
}) => {
  await page.goto("/stores");
  await expect(page).toHaveURL(/\/stores$/);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Copilote", exact: true }).click();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/ai/chat") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page
    .getByRole("button", {
      name: "Prépare un plan d’action priorisé pour le mois prochain.",
    })
    .click();
  const response = await responsePromise;
  const payload: unknown = await response.json();

  expect(response.status()).toBe(200);
  const result = storeCopilotResponseSchema.parse(payload);
  expect(result.actionPlan).not.toBeNull();
  const plan = result.actionPlan;
  if (!plan) throw new Error("Le modèle n’a pas créé le brouillon demandé");
  expect(plan.status).toBe("draft");
  expect(plan.executionStatus).toBe("not_executed");
  expect(plan.evidence.length).toBeGreaterThan(0);

  const planCard = page
    .getByRole("complementary", { name: "Cadre du Copilote" })
    .locator("article")
    .filter({ hasText: plan.title })
    .first();
  await expect(planCard).toContainText("Brouillon");
  await expect(planCard).toContainText("aucune exécution automatique");
  await planCard
    .getByLabel("Motif de la décision")
    .fill("Validation explicite de la recette E2E de release.");

  const decisionResponsePromise = page.waitForResponse(
    (candidate) =>
      candidate.url().includes(`/ai/action-plans/${plan.id}/decision`) &&
      candidate.request().method() === "POST",
  );
  await planCard.getByRole("button", { name: "Approuver" }).click();
  const decisionResponse = await decisionResponsePromise;
  const decisionPayload: unknown = await decisionResponse.json();

  expect(decisionResponse.status()).toBe(200);
  const decision = aiActionPlanDecisionResponseSchema.parse(decisionPayload);
  expect(decision.actionPlan.status).toBe("approved");
  expect(decision.actionPlan.executionStatus).toBe("not_executed");
  await expect(planCard).toContainText("Approuvé");
});

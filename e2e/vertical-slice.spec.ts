import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  recommendationFollowUpCompleteInputSchema,
  recommendationFollowUpResponseSchema,
  recommendationFollowUpScheduleInputSchema,
} from "@/domain/decisions/follow-up-schemas";
import {
  importFixtureIntoStore,
  primaryDemoStoreLabel,
  selectPrimaryDemoStore,
} from "./demo-store";

const fixtureByProject = {
  "mobile-390": {
    fileName: "10_2025.xlsx",
    periodKey: "2025-10",
    followUpFileName: "11_2025.xlsx",
    followUpPeriodKey: "2025-11",
  },
  "desktop-1440": {
    fileName: "11_2025.xlsx",
    periodKey: "2025-11",
    followUpFileName: "12_2025.xlsx",
    followUpPeriodKey: "2025-12",
  },
} as const;

test("HARD-01 expose une navigation clavier et réduit les mouvements", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.context().clearCookies();
  await page.goto("/sign-in");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Aller au contenu principal" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    )
    .toBe("auto");
});

test("E2E-01 transforme un export Mercalys en décision manager", async ({
  page,
}, testInfo) => {
  const projectName = testInfo.project.name as keyof typeof fixtureByProject;
  const fixture = fixtureByProject[projectName];
  const fixturePath = join(
    process.cwd(),
    "assets",
    "import_excel_files_examples",
    fixture.fileName,
  );
  let storeId = "";

  await test.step("connexion et sélection explicite du magasin principal", async () => {
    await page.goto("/stores");
    await expect(page).toHaveURL(/\/stores$/);
    await expect(
      page.getByRole("heading", { name: "Choisissez votre magasin" }),
    ).toBeVisible();
    await selectPrimaryDemoStore(page);
    await expect(
      page.getByRole("combobox", { name: "Magasin actif" }),
    ).toContainText(primaryDemoStoreLabel);
    await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const storeIdMatch = page.url().match(/\/stores\/([a-f\d]{24})\//i);
    expect(storeIdMatch).not.toBeNull();
    storeId = storeIdMatch?.[1] ?? "";
  });

  let importId = "";
  let dataRevision = -1;

  await test.step("prévisualisation, réconciliation et commit Mercalys", async () => {
    await page.getByRole("link", { name: "Imports" }).click();
    await expect(
      page.getByRole("heading", { name: "Import Mercalys" }),
    ).toBeVisible();
    const monthlyImport = page.getByLabel("Synthèse mensuelle");
    await monthlyImport.getByLabel("Export Mercalys").setInputFiles(fixturePath);

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/imports/preview") &&
        response.request().method() === "POST",
    );
    await monthlyImport
      .getByRole("button", { name: "Prévisualiser" })
      .click();
    const previewResponse = await previewResponsePromise;
    expect(previewResponse.status()).toBe(200);
    const preview = (await previewResponse.json()) as {
      importId: string;
      periodKey: string;
      excludedRowCount: number;
    };
    importId = preview.importId;

    await expect(page.getByText(fixture.periodKey, { exact: true })).toBeVisible();
    expect(preview.periodKey).toBe(fixture.periodKey);
    expect(preview.excludedRowCount).toBeGreaterThan(0);
    await expect(page.getByText(/Ligne sans libellé exclu/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Résolution des libellés" }),
    ).toBeVisible();

    const commitResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/imports/${importId}/commit`) &&
        response.request().method() === "POST",
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: "Valider l’import" }).click();
    const commitResponse = await commitResponsePromise;
    expect(commitResponse.status()).toBe(200);
    const commit = (await commitResponse.json()) as {
      importId: string;
      dataRevision: number;
      importedFactCount: number;
    };
    dataRevision = commit.dataRevision;

    expect(commit.importId).toBe(importId);
    expect(commit.importedFactCount).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "Import validé" }),
    ).toBeVisible({ timeout: 120_000 });
  });

  await test.step("réimport idempotent sans nouvelle révision", async () => {
    const buffer = await readFile(fixturePath);
    const secondPreviewResponse = await page.request.post(
      `/api/stores/${storeId}/imports/preview`,
      {
        multipart: {
          file: {
            name: fixture.fileName,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer,
          },
        },
      },
    );
    expect(secondPreviewResponse.status()).toBe(200);
    const secondPreview = (await secondPreviewResponse.json()) as {
      importId: string;
    };
    expect(secondPreview.importId).toBe(importId);

    const secondCommitResponse = await page.request.post(
      `/api/stores/${storeId}/imports/${importId}/commit`,
      { data: { resolutions: [] } },
    );
    expect(secondCommitResponse.status()).toBe(200);
    const secondCommit = (await secondCommitResponse.json()) as {
      dataRevision: number;
    };
    expect(secondCommit.dataRevision).toBe(dataRevision);
  });

  await test.step("dashboard et matrice produit réconciliés", async () => {
    await page.getByRole("link", { name: "Accueil" }).click();
    await expect(
      page.getByRole("heading", { name: "Tableau de bord" }),
    ).toBeVisible();
    await page.getByLabel("Période").fill(fixture.periodKey);
    await page.getByRole("button", { name: "Afficher" }).click();
    await expect(page.getByText(`Période ${fixture.periodKey}`)).toBeVisible();
    await expect(page.getByText("Chiffre d’affaires", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Voir les produits" }).click();
    await expect(page.getByRole("heading", { name: "Produits" })).toBeVisible();
    await expect(page.getByText(`période ${fixture.periodKey}`)).toBeVisible();
    await expect(page.getByText(/XYZ réel sur \d+ semaines candidates/)).toBeVisible();
    await expect(page.getByLabel("XYZ réel")).toBeVisible();

    const matrix = page.getByRole("table", { name: /Matrice des produits/ });
    if (projectName === "desktop-1440") {
      await expect(matrix).toBeVisible();
    } else {
      await expect(matrix).toBeHidden();
    }
  });

  await test.step("explication, décision explicite et journal immuable", async () => {
    const productLink =
      projectName === "desktop-1440"
        ? page
            .getByRole("table", { name: /Matrice des produits/ })
            .getByRole("link")
            .first()
        : page.locator('main a[href*="/products/"]:visible').first();
    await expect(productLink).toBeVisible();
    await productLink.click();

    await expect(page.getByText("Pourquoi cette recommandation ?")).toBeVisible();
    await expect(page.getByText(/Modèle .* calcul .* révision/)).toBeVisible();
    const rationale = `Validation E2E ${projectName} · ${fixture.periodKey}`;
    await page.getByLabel("Note").fill(rationale);

    const decisionResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/decision") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    const decisionResponse = await decisionResponsePromise;
    expect(decisionResponse.status()).toBe(200);
    await expect(page.getByText("Décision enregistrée")).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir le journal" }).click();

    await expect(
      page.getByRole("heading", { name: "Journal des décisions" }),
    ).toBeVisible();
    await expect(page.getByText(rationale).first()).toBeVisible();

    const decisionCard = page
      .locator("article")
      .filter({ hasText: rationale })
      .first();
    await decisionCard
      .getByLabel("Période après")
      .fill(fixture.followUpPeriodKey);
    await decisionCard.getByLabel("Échéance de contrôle").fill("2040-01-28");
    const scheduleResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/follow-ups") &&
        response.request().method() === "POST",
    );
    await decisionCard
      .getByRole("button", { name: "Planifier le suivi" })
      .click();
    const scheduleResponse = await scheduleResponsePromise;
    expect(scheduleResponse.status()).toBe(200);
    const scheduled = recommendationFollowUpResponseSchema.parse(
      await scheduleResponse.json(),
    );
    const scheduleInput = recommendationFollowUpScheduleInputSchema.parse(
      scheduleResponse.request().postDataJSON(),
    );
    const duplicateSchedule = await page.request.post(
      `/api/stores/${storeId}/decisions/${scheduled.followUp.recommendationDecisionId}/follow-ups`,
      { data: scheduleInput },
    );
    expect(duplicateSchedule.status()).toBe(200);
    expect(
      recommendationFollowUpResponseSchema.parse(await duplicateSchedule.json())
        .followUp.id,
    ).toBe(scheduled.followUp.id);
    await expect(decisionCard.getByText("Suivi 2025")).toBeVisible();

    await importFixtureIntoStore({
      fileName: fixture.followUpFileName,
      fixturePath: join(
        process.cwd(),
        "assets",
        "import_excel_files_examples",
        fixture.followUpFileName,
      ),
      page,
      storeId,
    });
    const outcomeInterpretation = `Résultat vérifié après import ${fixture.followUpPeriodKey}`;
    await decisionCard
      .getByLabel("Interprétation du résultat")
      .fill(outcomeInterpretation);
    await decisionCard
      .getByLabel("Limites complémentaires")
      .fill("Promotion locale non isolée");
    const outcomeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/follow-ups/") &&
        response.request().method() === "PATCH",
    );
    await decisionCard
      .getByRole("button", { name: "Enregistrer le réalisé" })
      .click();
    const outcomeResponse = await outcomeResponsePromise;
    expect(outcomeResponse.status()).toBe(200);
    const completed = recommendationFollowUpResponseSchema.parse(
      await outcomeResponse.json(),
    );
    const completeInput = recommendationFollowUpCompleteInputSchema.parse(
      outcomeResponse.request().postDataJSON(),
    );
    const duplicateOutcome = await page.request.patch(
      `/api/stores/${storeId}/decisions/${completed.followUp.recommendationDecisionId}/follow-ups/${completed.followUp.id}`,
      { data: completeInput },
    );
    expect(duplicateOutcome.status()).toBe(200);
    expect(
      recommendationFollowUpResponseSchema.parse(await duplicateOutcome.json())
        .followUp,
    ).toMatchObject({ id: completed.followUp.id, status: "completed" });

    const isolatedOutcome = await page.request.patch(
      `/api/stores/000000000000000000000000/decisions/${completed.followUp.recommendationDecisionId}/follow-ups/${completed.followUp.id}`,
      { data: completeInput },
    );
    expect(isolatedOutcome.status()).toBe(404);
    await expect(decisionCard.getByText("Résultat observé")).toBeVisible();
    await expect(decisionCard.getByText(outcomeInterpretation)).toBeVisible();
    await expect(
      decisionCard.getByText(/aucun effet causal ne peut être attribué/),
    ).toBeVisible();
  });

  await test.step("un storeId inconnu ne divulgue aucune donnée", async () => {
    const response = await page.request.get(
      `/api/stores/000000000000000000000000/dashboard?period=${fixture.periodKey}`,
    );
    expect(response.status()).toBe(404);
  });
});

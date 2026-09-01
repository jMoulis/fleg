import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const credentials = {
  email: process.env.E2E_EMAIL ?? "admin@fleg.local",
  password: process.env.E2E_PASSWORD ?? "FlegDemo!2026",
};

const fixtureByProject = {
  "mobile-390": { fileName: "10_2025.xlsx", periodKey: "2025-10" },
  "desktop-1440": { fileName: "11_2025.xlsx", periodKey: "2025-11" },
} as const;

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

  await test.step("connexion et sélection du seul magasin autorisé", async () => {
    await page.goto("/sign-in");
    await page.getByLabel("Adresse e-mail").fill(credentials.email);
    await page.getByLabel("Mot de passe").fill(credentials.password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page).toHaveURL(/\/stores$/);
    await expect(
      page.getByRole("heading", { name: "Choisissez votre magasin" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Magasin actif" }),
    ).toContainText("Magasin F&L Démo · DEMO-01");
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
    await page.getByLabel("Export Mercalys").setInputFiles(fixturePath);

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/imports/preview") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Prévisualiser" }).click();
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
  });

  await test.step("un storeId inconnu ne divulgue aucune donnée", async () => {
    const response = await page.request.get(
      `/api/stores/000000000000000000000000/dashboard?period=${fixture.periodKey}`,
    );
    expect(response.status()).toBe(404);
  });
});

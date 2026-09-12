import {
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { join } from "node:path";

import {
  attachmentCreateMetadataSchema,
  attachmentDeletionResponseSchema,
  attachmentResponseSchema,
  attachmentsResponseSchema,
  type Attachment,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import {
  commercialEventCreateInputSchema,
  commercialEventResponseSchema,
} from "@/domain/commercial-events/schemas";
import { markdownCreateInputSchema } from "@/domain/markdown/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { allocationPlanResponseSchema } from "@/domain/space/allocation-schemas";
import {
  productSpacePolicySetResponseSchema,
  productSpacePolicySetUpdateInputSchema,
} from "@/domain/space/product-space-policy-schemas";
import { layoutResponseSchema } from "@/domain/space/schemas";
import {
  getDemoStorePair,
  importFixtureIntoStore,
  selectPrimaryDemoStore,
} from "./demo-store";

const networkFixtureByProject = {
  "mobile-390": "10_2025.xlsx",
  "desktop-1440": "11_2025.xlsx",
} as const;

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function signInToStore(page: Page) {
  await page.goto("/stores");
  await expect(page).toHaveURL(/\/stores$/);
  await selectPrimaryDemoStore(page);
  const openCockpitButton = page.getByRole("button", {
    name: "Ouvrir le cockpit",
  });
  await expect(openCockpitButton).toBeVisible();
  await openCockpitButton.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Tableau de bord" }),
  ).toBeVisible();

  const match = page.url().match(/^(.*\/stores\/([a-f\d]{24}))\/dashboard$/i);
  expect(match).not.toBeNull();

  return {
    storeBaseUrl: match?.[1] ?? "",
    storeId: match?.[2] ?? "",
  };
}

async function chooseFirstOption(trigger: Locator, page: Page) {
  await trigger.click();
  const option = page.getByRole("option").filter({ visible: true }).first();
  await expect(option).toBeVisible();
  await option.click();
}

function recipeMarker(projectName: string) {
  return `${projectName}-${Date.now()}`;
}

async function importProjectFixture(input: {
  page: Page;
  projectName: string;
  storeId: string;
}) {
  const projectName = input.projectName as keyof typeof networkFixtureByProject;
  const fileName = networkFixtureByProject[projectName];

  expect(fileName, `Fixture inconnue pour le projet ${input.projectName}`).toBeDefined();
  if (!fileName) {
    throw new Error(`Fixture inconnue pour le projet ${input.projectName}`);
  }

  return importFixtureIntoStore({
    fileName,
    fixturePath: join(
      process.cwd(),
      "assets",
      "import_excel_files_examples",
      fileName,
    ),
    page: input.page,
    storeId: input.storeId,
  });
}

function isolatedFutureWindow() {
  const epoch = Date.UTC(2100, 0, 1);
  const offsetDays =
    Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % 1_000_000;
  const startsOn = new Date(epoch + offsetDays * 86_400_000);
  const endsOn = new Date(startsOn.getTime() + 6 * 86_400_000);

  return {
    startsOn: startsOn.toISOString().slice(0, 10),
    endsOn: endsOn.toISOString().slice(0, 10),
  };
}

async function uploadRecipePhoto(input: {
  page: Page;
  storeId: string;
  target: AttachmentTarget;
  caption: string;
}): Promise<Attachment> {
  const metadata = attachmentCreateMetadataSchema.parse({
    target: input.target,
    caption: input.caption,
    idempotencyKey: crypto.randomUUID(),
  });
  const response = await input.page.request.post(
    `/api/stores/${input.storeId}/attachments`,
    {
      multipart: {
        metadata: JSON.stringify(metadata),
        file: {
          name: "photo-recette.png",
          mimeType: "image/png",
          buffer: onePixelPng,
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  return attachmentResponseSchema.parse(await response.json()).attachment;
}

test("REL-01 versionne le plan et enregistre une allocation", async ({
  page,
}, testInfo) => {
  const marker = recipeMarker(testInfo.project.name);
  const { storeBaseUrl, storeId } = await signInToStore(page);
  const allocationPeriodKey = await importProjectFixture({
    page,
    projectName: testInfo.project.name,
    storeId,
  });
  const productOptionsResponse = await page.request.get(
    `/api/stores/${storeId}/products/options`,
  );
  expect(productOptionsResponse.status()).toBe(200);
  const productOptions = productOptionsResponseSchema.parse(
    await productOptionsResponse.json(),
  );
  const currentPoliciesResponse = await page.request.get(
    `/api/stores/${storeId}/space-policies`,
  );
  expect(currentPoliciesResponse.status()).toBe(200);
  const currentPolicies = productSpacePolicySetResponseSchema.parse(
    await currentPoliciesResponse.json(),
  );
  const configuredProductIds = new Set(
    currentPolicies.policySet.policies.map((policy) => policy.productId),
  );
  const policyProduct =
    productOptions.products.find(
      (product) => !configuredProductIds.has(product.id),
    ) ?? productOptions.products[0];
  expect(policyProduct).toBeDefined();
  if (!policyProduct) throw new Error("Produit de recette absent");
  const markdownInput = markdownCreateInputSchema.parse({
    idempotencyKey: crypto.randomUUID(),
    productId: policyProduct.id,
    occurredOn: `${allocationPeriodKey}-15`,
    amountCents: 123,
    quantity: 1,
    reason: "quality",
    notes: `Démarque allocation ${marker}`,
  });
  const markdownResponse = await page.request.post(
    `/api/stores/${storeId}/markdown`,
    { data: markdownInput },
  );
  expect(markdownResponse.status()).toBe(201);

  await page.goto(`${storeBaseUrl}/space`);
  await expect(page.getByRole("heading", { name: "Espace" })).toBeVisible();
  await page.getByRole("link", { name: "Modifier le plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Modifier le plan" }),
  ).toBeVisible();

  await page.getByLabel("Nom du plan").fill(`Plan recette ${marker}`);
  await page
    .getByLabel("Note de version")
    .fill(`Version créée par la recette E2E ${marker}`);
  await page.getByRole("button", { name: /Créer la version \d+/ }).click();

  await expect(page).toHaveURL(/\/space\?savedVersion=\d+$/);
  await expect(page.getByText(/Version \d+ enregistrée/)).toBeVisible();

  await page.getByRole("link", { name: "Allouer l’espace" }).click();
  await expect(
    page.getByRole("heading", { name: "Allocation de l’espace" }),
  ).toBeVisible();
  const policyCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Contraintes produits" })
    .first();
  expect(
    await policyCard.locator("[data-policy-product-option]").count(),
  ).toBeLessThanOrEqual(10);
  await policyCard
    .getByLabel("Produit à configurer")
    .fill(policyProduct.label);
  await policyCard
    .getByRole("button", {
      name: `Configurer ${policyProduct.label}`,
      exact: true,
    })
    .click();
  await policyCard.getByRole("checkbox", { name: "Stock obligatoire" }).check();
  await policyCard
    .getByRole("combobox", { name: "Compatibilité mobilier" })
    .click();
  await page
    .getByRole("option", { name: "Mobiliers autorisés", exact: true })
    .click();
  const policyResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/space-policies") &&
      response.request().method() === "PATCH",
  );
  await policyCard
    .getByRole("button", { name: "Enregistrer les contraintes" })
    .click();
  const policyResponse = await policyResponsePromise;
  expect(policyResponse.status()).toBe(200);
  const savedPolicies = productSpacePolicySetResponseSchema.parse(
    await policyResponse.json(),
  );
  const policyInput = productSpacePolicySetUpdateInputSchema.parse(
    policyResponse.request().postDataJSON(),
  );
  const duplicatePolicyResponse = await page.request.patch(
    `/api/stores/${storeId}/space-policies`,
    { data: policyInput },
  );
  expect(duplicatePolicyResponse.status()).toBe(200);
  expect(
    productSpacePolicySetResponseSchema.parse(
      await duplicatePolicyResponse.json(),
    ).policySet.revision,
  ).toBe(savedPolicies.policySet.revision);
  const isolatedPolicyResponse = await page.request.patch(
    "/api/stores/000000000000000000000000/space-policies",
    { data: policyInput },
  );
  expect(isolatedPolicyResponse.status()).toBe(404);
  await expect(policyCard.getByText(/révision \d+/i).first()).toBeVisible();
  await expect(page.getByText(/Démarque observée pour/).first()).toBeVisible();
  const allocationPicker = page.getByRole("region", {
    name: "Ajouter un produit",
  });
  expect(
    await allocationPicker.locator("[data-allocation-product-option]").count(),
  ).toBeLessThanOrEqual(10);
  await allocationPicker
    .getByLabel("Rechercher un produit à ajouter")
    .fill(policyProduct.label);
  await allocationPicker
    .getByRole("button", {
      name: `Ajouter ${policyProduct.label}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Retirer ${policyProduct.label}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Calculer une proposition" })
    .click();
  await expect(page.getByText("Capacité respectée")).toBeVisible();
  await page.locator("#allocation-name").fill(`Allocation recette ${marker}`);
  await page
    .locator("#allocation-note")
    .fill(`Allocation vérifiée par la recette E2E ${marker}`);
  const allocationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/allocations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  const allocationResponse = await allocationResponsePromise;
  expect(allocationResponse.status()).toBe(201);
  const savedAllocation = allocationPlanResponseSchema.parse(
    await allocationResponse.json(),
  ).plan;
  expect(savedAllocation).not.toBeNull();
  expect(savedAllocation).toMatchObject({
    modelVersion: "space-allocation-heuristic-v2",
    constraintSnapshot: {
      policyRevision: savedPolicies.policySet.revision,
    },
    economics: {
      markdownCoverage: "partial",
    },
  });
  expect(
    savedAllocation?.constraintSnapshot.policies.some(
      (policy) =>
        policy.productId === policyProduct.id && policy.mustStock,
    ),
  ).toBe(true);
  expect(
    savedAllocation?.allocations.some(
      (allocation) => allocation.productId === policyProduct.id,
    ),
  ).toBe(true);

  await expect(page).toHaveURL(/\/space\/allocations\?savedPlanVersion=\d+$/);
  await expect(page.getByText(/Allocation \d+ enregistrée/)).toBeVisible();
  await page.waitForTimeout(500);
  await page.waitForLoadState("networkidle");
});

test("REL-02 publie une TG puis consigne une démarque", async ({
  page,
}, testInfo) => {
  const marker = recipeMarker(testInfo.project.name);
  const window = isolatedFutureWindow();
  const { storeBaseUrl, storeId } = await signInToStore(page);
  await importProjectFixture({
    page,
    projectName: testInfo.project.name,
    storeId,
  });
  const productOptionsResponse = await page.request.get(
    `/api/stores/${storeId}/products/options`,
  );
  expect(productOptionsResponse.status()).toBe(200);
  const markdownProduct = productOptionsResponseSchema.parse(
    await productOptionsResponse.json(),
  ).products[0];
  expect(markdownProduct).toBeDefined();
  if (!markdownProduct) throw new Error("Produit de démarque absent");

  await page.goto(`${storeBaseUrl}/tg`);
  await expect(
    page.getByRole("heading", { name: "Planning des têtes de gondole" }),
  ).toBeVisible();
  await page.locator("#tg-title").fill(`Opération recette ${marker}`);
  await page.locator("#tg-theme").fill("Validation de release");
  await page.locator("#tg-start").fill(window.startsOn);
  await page.locator("#tg-end").fill(window.endsOn);

  const operationEditor = page.getByRole("complementary", {
    name: "Configuration de l'opération",
  });
  expect(
    await operationEditor.locator("[data-product-picker-option]").count(),
  ).toBeLessThanOrEqual(10);
  await operationEditor
    .getByRole("textbox", { name: "Ajouter un produit", exact: true })
    .fill(markdownProduct.label);
  await operationEditor
    .getByRole("button", {
      name: `Ajouter ${markdownProduct.label}`,
      exact: true,
    })
    .click();
  await expect(
    operationEditor.getByText(markdownProduct.label, { exact: true }),
  ).toBeVisible();
  await page.locator("#tg-target-revenue").fill("250");

  const publishResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/commercial-events") &&
      response.request().method() === "POST",
  );
  await operationEditor.getByRole("button", { name: "Publier" }).click();
  expect((await publishResponsePromise).status()).toBe(201);
  await expect(page.getByText("Opération publiée.")).toBeVisible();

  await page.locator("#tg-actual-revenue").fill("300");
  await page.locator("#tg-actual-margin").fill("90");
  const completeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/commercial-events/") &&
      response.request().method() === "PATCH",
  );
  await operationEditor.getByRole("button", { name: "Terminer" }).click();
  expect((await completeResponsePromise).status()).toBe(200);
  await expect(
    page.getByText("Résultats enregistrés et opération terminée."),
  ).toBeVisible();

  const cancelledWindow = isolatedFutureWindow();
  await operationEditor
    .getByRole("button", { name: "Créer une autre opération" })
    .click();
  await page.locator("#tg-title").fill(`Brouillon annulé ${marker}`);
  await page.locator("#tg-theme").fill("Validation historique borné");
  await page.locator("#tg-start").fill(cancelledWindow.startsOn);
  await page.locator("#tg-end").fill(cancelledWindow.endsOn);
  await operationEditor
    .getByRole("textbox", { name: "Ajouter un produit", exact: true })
    .fill(markdownProduct.label);
  await operationEditor
    .getByRole("button", {
      name: `Ajouter ${markdownProduct.label}`,
      exact: true,
    })
    .click();
  const draftResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/commercial-events") &&
      response.request().method() === "POST",
  );
  await operationEditor
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  expect((await draftResponsePromise).status()).toBe(201);
  const cancelResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/commercial-events/") &&
      response.request().method() === "PATCH",
  );
  await operationEditor
    .getByRole("button", { name: "Annuler ce brouillon" })
    .click();
  expect((await cancelResponsePromise).status()).toBe(200);
  await page.getByText(/Opérations annulées \(\d+\)/).click();
  expect(
    await page.locator("[data-cancelled-event-item]").count(),
  ).toBeLessThanOrEqual(25);
  await expect(
    page.getByRole("button", {
      name: new RegExp(`Brouillon annulé ${marker}$`),
    }),
  ).toBeVisible();

  await page.goto(`${storeBaseUrl}/markdown`);
  await expect(page.getByRole("heading", { name: "Démarque" })).toBeVisible();
  expect(
    await page.locator("[data-product-picker-option]").count(),
  ).toBeLessThanOrEqual(10);
  await page
    .getByLabel("Produit", { exact: true })
    .fill(markdownProduct.label);
  await page
    .getByRole("button", {
      name: `Sélectionner ${markdownProduct.label}`,
      exact: true,
    })
    .click();
  await page.getByLabel("Montant de perte (€)").fill("1.23");
  await page.getByLabel("Quantité (facultatif)").fill("1");
  await page
    .getByLabel("Notes (facultatif)")
    .fill(`Démarque recette ${marker}`);

  const markdownResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/markdown") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enregistrer la démarque" }).click();
  expect((await markdownResponsePromise).status()).toBe(201);
  await expect(page.getByText("Saisie enregistrée")).toBeVisible();
  await expect(page.getByText(`Démarque recette ${marker}`)).toBeVisible();
  expect(
    await page.locator("[data-markdown-history-item]").count(),
  ).toBeLessThanOrEqual(25);
  await page.getByLabel("Rechercher dans l’historique").fill(marker);
  await expect(page.getByText(`Démarque recette ${marker}`)).toBeVisible();
});

test("REL-03 planifie, démarre et termine une expérience", async ({
  page,
}, testInfo) => {
  const marker = recipeMarker(testInfo.project.name);
  const { storeBaseUrl, storeId } = await signInToStore(page);
  await importProjectFixture({
    page,
    projectName: testInfo.project.name,
    storeId,
  });
  const productOptionsResponse = await page.request.get(
    `/api/stores/${storeId}/products/options`,
  );
  expect(productOptionsResponse.status()).toBe(200);
  const productOptions = productOptionsResponseSchema.parse(
    await productOptionsResponse.json(),
  );
  expect(productOptions.products.length).toBeGreaterThan(0);
  const testedProduct = productOptions.products[0]!;

  await page.goto(`${storeBaseUrl}/experiments/new`);
  await expect(
    page.getByRole("heading", { name: "Préparer une expérience" }),
  ).toBeVisible();
  await page.getByLabel("Nom du test").fill(`Test recette ${marker}`);
  await page
    .getByLabel("Hypothèse")
    .fill("Si la présentation est renforcée, alors le chiffre d’affaires progressera sans dégrader la démarque.");
  await page.getByRole("button", { name: "Continuer" }).click();

  expect(
    await page.locator("[data-experiment-event-picker-option]").count(),
  ).toBeLessThanOrEqual(10);
  await chooseFirstOption(page.locator("#experiment-fixture"), page);
  expect(
    await page.locator("[data-product-picker-option]").count(),
  ).toBeLessThanOrEqual(10);
  await page
    .getByRole("textbox", { name: "Ajouter un produit testé" })
    .fill(testedProduct.label);
  await page
    .getByRole("button", {
      name: `Ajouter ${testedProduct.label}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Retirer ${testedProduct.label}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel(/Famille, si le test porte/).fill("Fruits de recette");
  await page
    .getByLabel("Traitement prévu")
    .fill("Renforcer la visibilité de la famille sur le mobilier sélectionné.");
  await page
    .getByLabel("Effet opérationnel attendu")
    .fill("Améliorer la conversion à trafic et prix constants.");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#baseline-method").click();
  await page
    .getByRole("option", { name: "Différence de différences", exact: true })
    .click();
  const controlStore = page
    .getByRole("group", { name: "Magasins témoins" })
    .locator("label")
    .filter({ hasText: "DEMO-02" });
  await expect(controlStore).toContainText("Magasin F&L Témoin");
  await controlStore.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Effet attendu (%)").fill("5");
  await page.getByLabel("Coûts explicites (€)").fill("10");
  await page.getByRole("button", { name: "Continuer" }).click();

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/experiments") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Planifier" }).click();
  expect((await createResponsePromise).status()).toBe(201);
  await expect(page).toHaveURL(/\/experiments\/[a-f\d]{24}\?planned=1$/i);
  await expect(
    page.getByRole("heading", { name: `Test recette ${marker}` }),
  ).toBeVisible();
  await expect(page.getByText("Test planifié.")).toBeVisible();

  await page
    .getByRole("button", { name: "Confirmer le démarrage" })
    .click();
  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/start") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Démarrer", exact: true }).click();
  expect((await startResponsePromise).status()).toBe(200);
  await expect(page.getByText(/Le test est démarré/)).toBeVisible();

  await page.getByRole("button", { name: "Terminer le test" }).click();
  await page
    .getByLabel("Bilan d’exécution")
    .fill(`Protocole exécuté par la recette ${marker}`);
  const finishResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/finish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  expect((await finishResponsePromise).status()).toBe(200);
  await expect(page.getByText(/Exécution terminée/).first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.waitForLoadState("networkidle");

  await page.goto(`${storeBaseUrl}/experiments`);
  await page.getByRole("tab", { name: /À analyser/ }).click();
  expect(
    await page.locator("[data-experiment-list-item]").count(),
  ).toBeLessThanOrEqual(25);
  await page.getByLabel("Rechercher dans les tests").fill(marker);
  await expect(
    page.getByRole("heading", { name: `Test recette ${marker}` }),
  ).toBeVisible();
});

test("REL-04 ouvre la vue réseau dans le périmètre autorisé", async ({
  page,
}, testInfo) => {
  const { storeBaseUrl } = await signInToStore(page);
  const stores = await getDemoStorePair(page);
  const projectName = testInfo.project.name as keyof typeof networkFixtureByProject;
  const fileName = networkFixtureByProject[projectName];
  const fixturePath = join(
    process.cwd(),
    "assets",
    "import_excel_files_examples",
    fileName,
  );
  const periods = await Promise.all(
    [stores.primary, stores.control].map((store) =>
      importFixtureIntoStore({ fileName, fixturePath, page, storeId: store.id }),
    ),
  );
  expect(new Set(periods).size).toBe(1);
  const organizationBaseUrl = storeBaseUrl.replace(/\/stores\/[a-f\d]{24}$/i, "");
  const networkQuery = new URLSearchParams({ period: periods[0] });
  networkQuery.append("storeId", stores.primary.id);
  networkQuery.append("storeId", stores.control.id);
  await page.goto(`${organizationBaseUrl}/network?${networkQuery.toString()}`);

  await expect(page).toHaveURL(/\/network/);
  await expect(
    page.getByRole("heading", { name: "Tableau de bord réseau" }),
  ).toBeVisible();
  await expect(page.getByText("2 magasins explicitement autorisés")).toBeVisible();
  const indicators = page.getByRole("region", { name: "Indicateurs réseau" });
  await expect(indicators).toBeVisible();
  await expect(indicators.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: stores.primary.name }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: stores.control.name }).first()).toBeVisible();

  const comparison = page.getByRole("table");
  if (testInfo.project.name === "desktop-1440") {
    await expect(comparison).toBeVisible();
  } else {
    await expect(comparison).toBeHidden();
  }
});

test("REL-05 configure un objectif et versionne les coefficients magasin", async ({
  page,
}, testInfo) => {
  const { storeBaseUrl } = await signInToStore(page);
  const periodKey = testInfo.project.name === "mobile-390" ? "2038-01" : "2038-02";
  await page.goto(`${storeBaseUrl}/settings`);
  await expect(
    page.getByRole("heading", { name: "Paramètres magasin" }),
  ).toBeVisible();

  await page.locator("#target-period").fill(periodKey);
  await page.locator("#target-revenue").fill("1234.56");
  const targetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/targets") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Enregistrer l’objectif" }).click();
  const targetResponse = await targetResponsePromise;
  expect(targetResponse.status()).toBe(200);
  await expect(targetResponse.json()).resolves.toMatchObject({
    target: {
      periodKey,
      targetRevenueCents: 123_456,
    },
  });
  await expect(page.getByText(`Objectif ${periodKey} enregistré.`)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`${periodKey}\\s+1\\s235\\s€`),
    }),
  ).toBeVisible();

  await page.locator("#abcAThreshold").fill(
    testInfo.project.name === "mobile-390" ? "79" : "80",
  );
  const settingsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/settings") &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Enregistrer les coefficients" })
    .click();
  expect((await settingsResponsePromise).status()).toBe(200);
  await expect(page.getByText(/Réglages enregistrés · révision \d+/)).toBeVisible();
});

test("REL-06 sécurise les photos manuelles sans modifier le plan", async ({
  page,
}, testInfo) => {
  const marker = recipeMarker(testInfo.project.name);
  const { storeBaseUrl, storeId } = await signInToStore(page);
  const stores = await getDemoStorePair(page);
  // TECH-04 foundation is dark: existing photos work, but no Blob intent or
  // credential can be issued by the deployed E2E application.
  const intentResponse = await page.request.post(
    `/api/stores/${storeId}/attachments/upload-intents`,
    { data: {}, headers: { Origin: new URL(page.url()).origin } },
  );
  expect(intentResponse.status()).toBe(503);
  expect(await intentResponse.json()).toMatchObject({ code: "STORAGE_DISABLED" });
  expect(intentResponse.headers()["cache-control"]).toBe("private, no-store");
  const intentStatus = await page.request.get(
    `/api/stores/${storeId}/attachments/upload-intents/${crypto.randomUUID()}`,
  );
  expect(intentStatus.status()).toBe(503);
  for (const command of ["authorization", "cancel"]) {
    const response = await page.request.post(
      `/api/stores/${storeId}/attachments/upload-intents/${crypto.randomUUID()}/${command}`,
      { data: {}, headers: { Origin: new URL(page.url()).origin } },
    );
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ code: "STORAGE_DISABLED" });
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  const callback = await page.request.post("/api/storage/blob/upload-completed", { data: {} });
  expect(callback.status()).toBe(503);
  expect(await callback.json()).toMatchObject({ code: "STORAGE_DISABLED" });
  expect(callback.headers()["cache-control"]).toBe("private, no-store");
  const maintenance = await page.request.post(
    `/api/stores/${storeId}/attachments/maintenance`,
    {
      data: {},
      headers: { Origin: new URL(page.url()).origin },
    },
  );
  expect(maintenance.status()).toBe(503);
  expect(await maintenance.json()).toMatchObject({
    code: "STORAGE_CONFIGURATION",
  });
  const documents = await page.request.get(
    `/api/stores/${storeId}/attachments/documents`,
  );
  expect(documents.status()).toBe(200);
  expect(await documents.json()).toMatchObject({
    sources: [],
    nextCursor: null,
  });
  expect(documents.headers()["cache-control"]).toBe("private, no-store");
  await importProjectFixture({
    page,
    projectName: testInfo.project.name,
    storeId,
  });

  const layoutBeforeResponse = await page.request.get(
    `/api/stores/${storeId}/layout`,
  );
  expect(layoutBeforeResponse.status()).toBe(200);
  const layoutBefore = layoutResponseSchema.parse(
    await layoutBeforeResponse.json(),
  ).layout;
  expect(layoutBefore).not.toBeNull();
  if (!layoutBefore) throw new Error("Plan de recette absent");
  const fixture = layoutBefore.fixtures[0];
  const endcap = layoutBefore.fixtures.find(({ type }) => type === "endcap");
  expect(fixture).toBeDefined();
  expect(endcap).toBeDefined();
  if (!fixture || !endcap) throw new Error("Mobilier de recette absent");

  const productOptionsResponse = await page.request.get(
    `/api/stores/${storeId}/products/options`,
  );
  expect(productOptionsResponse.status()).toBe(200);
  const product = productOptionsResponseSchema.parse(
    await productOptionsResponse.json(),
  ).products[0];
  expect(product).toBeDefined();
  if (!product) throw new Error("Produit de recette absent");
  const eventWindow = isolatedFutureWindow();
  const eventInput = commercialEventCreateInputSchema.parse({
    layoutVersionId: layoutBefore.id,
    fixtureId: endcap.id,
    title: `Opération photo ${marker}`,
    theme: "Photothèque de recette",
    startsOn: eventWindow.startsOn,
    endsOn: eventWindow.endsOn,
    productIds: [product.id],
    targetRevenueCents: 10_000,
    targetMarginCents: null,
    actualRevenueCents: null,
    actualMarginCents: null,
    notes: null,
    idempotencyKey: crypto.randomUUID(),
    action: "save",
  });
  const eventResponse = await page.request.post(
    `/api/stores/${storeId}/commercial-events`,
    { data: eventInput },
  );
  expect(eventResponse.status()).toBe(201);
  const commercialEvent = commercialEventResponseSchema.parse(
    await eventResponse.json(),
  ).event;

  const invalidPhotoResponse = await page.request.post(
    `/api/stores/${storeId}/attachments`,
    {
      multipart: {
        metadata: JSON.stringify(
          attachmentCreateMetadataSchema.parse({
            target: { type: "store" },
            caption: null,
            idempotencyKey: crypto.randomUUID(),
          }),
        ),
        file: {
          name: "faux.png",
          mimeType: "image/png",
          buffer: Buffer.from("ceci n'est pas une image"),
        },
      },
    },
  );
  expect(invalidPhotoResponse.status()).toBe(400);

  const uploaded = await Promise.all([
    uploadRecipePhoto({
      page,
      storeId,
      target: { type: "store" },
      caption: `Magasin ${marker}`,
    }),
    uploadRecipePhoto({
      page,
      storeId,
      target: { type: "layout", layoutVersionId: layoutBefore.id },
      caption: `Plan ${marker}`,
    }),
    uploadRecipePhoto({
      page,
      storeId,
      target: {
        type: "fixture",
        layoutVersionId: layoutBefore.id,
        fixtureId: fixture.id,
      },
      caption: `Mobilier ${marker}`,
    }),
    uploadRecipePhoto({
      page,
      storeId,
      target: { type: "commercial_event", eventId: commercialEvent.id },
      caption: `Opération ${marker}`,
    }),
  ]);

  for (const attachment of uploaded) {
    const contentResponse = await page.request.get(attachment.contentUrl);
    expect(contentResponse.status()).toBe(200);
    expect(contentResponse.headers()["content-type"]).toBe("image/png");
    expect(contentResponse.headers()["cache-control"]).toBe("private, no-store");
    expect(contentResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await contentResponse.body()).subarray(0, 8)).toEqual(
      onePixelPng.subarray(0, 8),
    );
  }
  const isolatedContentResponse = await page.request.get(
    `/api/stores/${stores.control.id}/attachments/${uploaded[0]!.id}/content`,
  );
  expect(isolatedContentResponse.status()).toBe(404);

  const listResponse = await page.request.get(
    `/api/stores/${storeId}/attachments`,
  );
  expect(listResponse.status()).toBe(200);
  const attachmentList = attachmentsResponseSchema.parse(
    await listResponse.json(),
  );
  expect(attachmentList.policy).toMatchObject({
    maxSizeBytes: 4 * 1024 * 1024,
    maxPerTarget: 20,
    retention: "until_manual_deletion",
    deletion: "permanent",
  });
  expect(
    uploaded.every((attachment) =>
      attachmentList.attachments.some(({ id }) => id === attachment.id),
    ),
  ).toBe(true);

  const layoutAfterResponse = await page.request.get(
    `/api/stores/${storeId}/layout`,
  );
  const layoutAfter = layoutResponseSchema.parse(
    await layoutAfterResponse.json(),
  ).layout;
  expect(layoutAfter?.fixtures).toEqual(layoutBefore.fixtures);

  await page.goto(`${storeBaseUrl}/tg`);
  const operationPhotos = page.getByRole("region", {
    name: "Photos des opérations commerciales",
  });
  await operationPhotos.getByRole("button", { name: "Changer" }).click();
  expect(
    await operationPhotos
      .locator("[data-attachment-target-picker-option]")
      .count(),
  ).toBeLessThanOrEqual(10);
  await operationPhotos
    .getByRole("textbox", { name: "Élément photographié" })
    .fill(marker);
  await operationPhotos
    .getByRole("button", {
      name: `Sélectionner ${commercialEvent.title} · ${commercialEvent.fixtureName}`,
      exact: true,
    })
    .click();
  await expect(
    operationPhotos.getByText(`Opération ${marker}`),
  ).toBeVisible();

  await page.goto(`${storeBaseUrl}/settings`);
  await expect(page.getByText(`Magasin ${marker}`)).toBeVisible();
  const storePhotoCard = page
    .locator("article")
    .filter({ hasText: `Magasin ${marker}` });
  const storeDeleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/attachments/${uploaded[0]!.id}`) &&
      response.request().method() === "DELETE",
  );
  await storePhotoCard.getByRole("button", { name: "Supprimer" }).click();
  await storePhotoCard.getByRole("button", { name: "Confirmer" }).click();
  expect((await storeDeleteResponsePromise).status()).toBe(200);
  await expect(
    page.getByText("Photo supprimée définitivement. La trace d’audit est conservée."),
  ).toBeVisible();

  for (const attachment of uploaded.slice(1)) {
    const idempotencyKey = crypto.randomUUID();
    const deletionResponse = await page.request.delete(
      `/api/stores/${storeId}/attachments/${attachment.id}`,
      { data: { idempotencyKey } },
    );
    expect(deletionResponse.status()).toBe(200);
    expect(
      attachmentDeletionResponseSchema.parse(await deletionResponse.json())
        .deletedAttachment.id,
    ).toBe(attachment.id);
    if (attachment.id === uploaded[2]!.id) {
      const duplicateDeletion = await page.request.delete(
        `/api/stores/${storeId}/attachments/${attachment.id}`,
        { data: { idempotencyKey } },
      );
      expect(duplicateDeletion.status()).toBe(200);
    }
  }
  expect((await page.request.get(uploaded[0]!.contentUrl)).status()).toBe(404);
});

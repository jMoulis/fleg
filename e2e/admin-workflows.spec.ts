import { expect, test } from "@playwright/test";

import {
  organizationCreateResponseSchema,
  organizationInvitationResponseSchema,
  storeAdminResponseSchema,
  storeMembershipAdminResponseSchema,
} from "@/domain/admin/schemas";
import { storesResponseSchema } from "@/domain/stores/schemas";
import { getDemoStorePair, selectPrimaryDemoStore } from "./demo-store";

async function openDemoAdministration(page: Parameters<typeof selectPrimaryDemoStore>[0]) {
  await page.goto("/stores");
  await selectPrimaryDemoStore(page);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await page.getByRole("link", { name: "Administrer l’organisation" }).click();
  await expect(page).toHaveURL(/\/reseau-fl-demo\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Réseau F&L Démo" }),
  ).toBeVisible();
}

test("ADM-01 crée un magasin et attribue un accès explicitement isolé", async ({
  browser,
  page,
}, testInfo) => {
  await openDemoAdministration(page);
  const stores = await getDemoStorePair(page);
  const marker = `${testInfo.project.name === "mobile-390" ? "M" : "D"}${Date.now()
    .toString()
    .slice(-7)}`;
  const code = `E2E-${marker}`;
  const name = `Magasin recette ${marker}`;

  await page.getByLabel("Nom", { exact: true }).first().fill(name);
  await page.getByLabel("Code", { exact: true }).first().fill(code);
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/stores") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Créer le magasin" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = storeAdminResponseSchema.parse(await createResponse.json());
  expect(created.store.code).toBe(code);
  await expect(page.getByText(`${name} est prêt.`)).toBeVisible();
  const createdStoreButton = page.getByRole("button", { name: new RegExp(code) });
  await expect(createdStoreButton).toBeVisible();
  await createdStoreButton.click();

  const managerCard = page.locator("article").filter({ hasText: "manager@fleg.local" });
  await expect(managerCard).toBeVisible();
  const membershipResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/stores/${created.store.id}/members`) &&
      response.request().method() === "POST",
  );
  await managerCard.getByRole("button", { name: "Enregistrer l’accès" }).click();
  const membershipResponse = await membershipResponsePromise;
  expect(membershipResponse.status()).toBe(201);
  const membership = storeMembershipAdminResponseSchema.parse(
    await membershipResponse.json(),
  );
  expect(membership.membership).toMatchObject({
    storeId: created.store.id,
    role: "viewer",
    active: true,
  });

  const invitedEmail = `invite-${marker.toLocaleLowerCase("fr-FR")}@example.test`;
  const invitedPassword = `Invitation!${marker}2026`;
  await page.getByLabel("Adresse e-mail").fill(invitedEmail);
  const invitationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/organizations/") &&
      response.url().endsWith("/invitations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Créer le lien" }).click();
  const invitationResponse = await invitationResponsePromise;
  expect(invitationResponse.status()).toBe(201);
  const invitation = organizationInvitationResponseSchema.parse(
    await invitationResponse.json(),
  );
  expect(invitation.delivery).toEqual({ mode: "manual", status: "manual" });
  await expect(
    page.getByRole("button", { name: "Copier le lien d’acceptation" }),
  ).toBeVisible();

  const origin = new URL(page.url()).origin;
  const emptyStorageState = { cookies: [], origins: [] };
  const projectIpSuffix = testInfo.project.name === "mobile-390" ? 10 : 20;
  const managerContext = await browser.newContext({
    baseURL: origin,
    storageState: emptyStorageState,
    extraHTTPHeaders: {
      "x-forwarded-for": `192.0.2.${projectIpSuffix}`,
    },
  });
  const managerPage = await managerContext.newPage();
  try {
    await managerPage.goto("/sign-in");
    await managerPage.getByLabel("Adresse e-mail").fill("manager@fleg.local");
    await managerPage.getByLabel("Mot de passe").fill("FlegManager!2026");
    await managerPage.getByRole("button", { name: "Se connecter" }).click();
    await expect(managerPage).toHaveURL(/\/stores$/);

    const authorizedStoresResponse = await managerPage.request.get("/api/stores");
    expect(authorizedStoresResponse.status()).toBe(200);
    const authorizedStores = storesResponseSchema.parse(
      await authorizedStoresResponse.json(),
    ).stores;
    expect(authorizedStores.map(({ id }) => id)).toContain(created.store.id);
    expect(authorizedStores.map(({ id }) => id)).toContain(stores.primary.id);
    expect(authorizedStores.map(({ id }) => id)).not.toContain(stores.control.id);

    const forbiddenAdminResponse = await managerPage.request.get(
      `/api/stores/${created.store.id}`,
    );
    expect(forbiddenAdminResponse.status()).toBe(404);
    const forbiddenControlResponse = await managerPage.request.get(
      `/api/stores/${stores.control.id}/dashboard?period=2025-11`,
    );
    expect(forbiddenControlResponse.status()).toBe(404);
  } finally {
    await managerContext.close();
  }

  const invitedContext = await browser.newContext({
    baseURL: origin,
    storageState: emptyStorageState,
    extraHTTPHeaders: {
      "x-forwarded-for": `192.0.2.${projectIpSuffix + 1}`,
    },
  });
  const invitedPage = await invitedContext.newPage();
  try {
    await invitedPage.goto(invitation.acceptPath);
    await expect(
      invitedPage.getByRole("heading", { name: "Rejoindre Réseau F&L Démo" }),
    ).toBeVisible();
    await invitedPage.getByLabel("Nom complet").fill(`Invité ${marker}`);
    await invitedPage.getByLabel("Mot de passe", { exact: true }).fill(
      invitedPassword,
    );
    await invitedPage.getByLabel("Confirmer le mot de passe").fill(
      invitedPassword,
    );
    await invitedPage.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(invitedPage).toHaveURL(/\/sign-in\?.*registered=1/);
    await expect(invitedPage.getByText("Compte créé")).toBeVisible();

    await invitedPage.getByLabel("Adresse e-mail").fill(invitedEmail);
    await invitedPage.getByLabel("Mot de passe").fill(invitedPassword);
    await invitedPage.getByRole("button", { name: "Se connecter" }).click();
    await expect(invitedPage).toHaveURL(/\/invitations\//);
    await invitedPage
      .getByRole("button", { name: "Accepter l’invitation" })
      .click();
    await expect(invitedPage).toHaveURL(/\/stores$/);

    const storesWithoutAssignment = await invitedPage.request.get("/api/stores");
    expect(storesWithoutAssignment.status()).toBe(200);
    expect(
      storesResponseSchema.parse(await storesWithoutAssignment.json()).stores,
    ).toHaveLength(0);
  } finally {
    await invitedContext.close();
  }
});

test("ONB-01 crée une organisation et son premier magasin de manière idempotente", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Créer un nouveau réseau" }),
  ).toBeVisible();
  const command = {
    name: "Réseau Recette",
    slug: "reseau-recette-e2e",
    firstStore: { code: "RECETTE-01", name: "Magasin Recette" },
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };

  const firstResponse = await page.request.post("/api/organizations", {
    data: command,
  });
  expect(firstResponse.status()).toBe(201);
  const first = organizationCreateResponseSchema.parse(
    await firstResponse.json(),
  );
  const replayResponse = await page.request.post("/api/organizations", {
    data: command,
  });
  expect(replayResponse.status()).toBe(201);
  const replay = organizationCreateResponseSchema.parse(
    await replayResponse.json(),
  );

  expect(replay.organization.id).toBe(first.organization.id);
  expect(replay.store.id).toBe(first.store.id);
});

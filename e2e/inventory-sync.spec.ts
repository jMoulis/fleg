import { chromium, expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { getDemoStorePair, importFixtureIntoStore } from "./demo-store";
import { preparedWorkspaceSchema } from "@/domain/offline/schemas";
import {
  inventoryWorkspaceResponseSchema,
  inventoryCommitResponseSchema,
} from "@/domain/inventory/schemas";
import { inventorySyncInputSchema } from "@/domain/offline/sync";

async function prepare(
  page: Page,
  businessDate: string,
  importProducts = true,
) {
  const { primary } = await getDemoStorePair(page);
  if (importProducts)
    await importFixtureIntoStore({
      page,
      storeId: primary.id,
      fileName: "10_2025.xlsx",
      fixturePath: join(
        process.cwd(),
        "assets/import_excel_files_examples/10_2025.xlsx",
      ),
    });
  const response = await page.request.get(
    `/api/stores/${primary.id}/offline?businessDate=${businessDate}`,
  );
  expect(response.status()).toBe(200);
  const copy = preparedWorkspaceSchema.parse(await response.json());
  expect(copy.products.length).toBeGreaterThan(100);
  await page.goto(
    `/offline?storeId=${primary.id}&businessDate=${businessDate}`,
  );
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled({ timeout: 45000 });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await page
    .getByRole("button", { name: "Commencer un brouillon local" })
    .click();
  await expect(
    page.getByText("Enregistré sur cet appareil · non synchronisé", {
      exact: true,
    }),
  ).toBeVisible();
  const selectedProduct = copy.products.find((product) =>
    /banane/i.test(product.label),
  )!;
  expect(selectedProduct).toBeDefined();
  await page
    .getByLabel("Rechercher dans le brouillon")
    .fill(selectedProduct.label);
  return {
    ...copy,
    selectedProduct,
    organizationSlug: primary.organizationSlug,
  };
}
const row = (page: Page) => page.locator("[data-local-count-product]").first();
const panel = (page: Page) =>
  page.getByRole("region", { name: "Synchronisation du brouillon" });
async function fill(page: Page, quantity: string) {
  await row(page)
    .getByRole("combobox", { name: "Famille", exact: true })
    .selectOption("3400");
  await row(page)
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("kg");
  await row(page).getByLabel("Colisage du relevé").fill("18,5");
  await row(page).getByLabel("Colis en réserve").fill(quantity);
  await page.getByRole("button", { name: "Rayon", exact: true }).click();
  await row(page).getByLabel("Quantité en rayon", { exact: false }).fill("3,5");
  await expect(
    page.getByText("Enregistré sur cet appareil · non synchronisé", {
      exact: true,
    }),
  ).toBeVisible();
}
async function enable(page: Page) {
  await panel(page)
    .getByRole("button", { name: "Activer la synchronisation de ce brouillon" })
    .click();
}
async function connected(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(panel(page)).toBeVisible();
}
async function serverCount(page: Page, storeId: string, businessDate: string) {
  const response = await page.request.get(
    `/api/stores/${storeId}/inventory/counts?businessDate=${businessDate}`,
  );
  expect(response.status()).toBe(200);
  return inventoryWorkspaceResponseSchema.parse(await response.json())
    .workspace;
}

test("TECH-03 reprend après arrêt Chromium et rejoue une réponse perdue sans double écriture", async ({
  context,
  baseURL,
}, testInfo) => {
  const businessDate =
    testInfo.project.name === "mobile-390" ? "2025-10-20" : "2025-10-21";
  const profile = testInfo.outputPath("sync-persistent-profile");
  let persistent = await chromium.launchPersistentContext(profile, {
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    await persistent.addCookies(await context.cookies());
    let page = await persistent.newPage();
    const copy = await prepare(page, businessDate);
    const before = await serverCount(page, copy.identity.storeId, businessDate);
    expect(before.count).toBeNull();
    await persistent.setOffline(true);
    await fill(page, "2");
    await enable(page);
    await expect(
      panel(page).getByText("En attente de synchronisation", { exact: true }),
    ).toBeVisible();
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, {
      baseURL,
      viewport: testInfo.project.use.viewport,
    });
    await persistent.setOffline(true);
    page = await persistent.newPage();
    await page.goto("/offline");
    await expect(
      row(page).getByLabel("Quantité en rayon", { exact: false }),
    ).toHaveValue("3,5");
    const sends: string[] = [];
    let dropFirst = true;
    await persistent.route(
      `**/api/stores/${copy.identity.storeId}/offline/sync`,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        sends.push(route.request().postData()!);
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (dropFirst) {
          dropFirst = false;
          await route.abort("failed");
        } else await route.fulfill({ response });
      },
    );
    await persistent.setOffline(false);
    await connected(page);
    await expect(
      panel(page).getByText("Brouillon synchronisé", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    expect(sends.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sends).size).toBe(1);
    const payload = inventorySyncInputSchema.parse(JSON.parse(sends[0]));
    const after = await serverCount(page, copy.identity.storeId, businessDate);
    expect(after.count).toMatchObject({
      revision: 1,
      status: "draft",
      lines: [
        {
          productId: copy.selectedProduct.id,
          packSize: 18.5,
          reserveCaseCount: 2,
          shelfQuantity: 3.5,
          observedAt: payload.lines[0].observedAt,
        },
      ],
    });
    expect(
      after.products.every((product) => product.daySnapshot === null),
    ).toBe(true);
    const refreshed = preparedWorkspaceSchema.parse(
      await (
        await page.request.get(
          `/api/stores/${copy.identity.storeId}/offline?businessDate=${businessDate}`,
        )
      ).json(),
    );
    expect(refreshed.dataRevision).toBe(copy.dataRevision);
    const wrongSession = await page.request.post(
      `/api/stores/${copy.identity.storeId}/offline/sync`,
      { headers: { "x-fleg-session-binding": "0".repeat(64) }, data: payload },
    );
    expect(wrongSession.status()).toBe(404);
    // Changing owner in the body never borrows the currently connected actor's authority.
    const foreign = await page.request.post(
      `/api/stores/${copy.identity.storeId}/offline/sync`,
      {
        headers: { "x-fleg-session-binding": copy.identity.sessionBinding },
        data: { ...payload, owner: { ...payload.owner, userId: "other" } },
      },
    );
    expect(foreign.status()).toBe(404);
    await panel(page).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`sync-recovered-${testInfo.project.name}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const online = await persistent.newPage();
    await online.goto(
      `/${copy.organizationSlug}/stores/${copy.identity.storeId}/inventory?businessDate=${businessDate}`,
    );
    await online.getByRole("button", { name: /Vérifier/ }).click();
    const committedResponse = online.waitForResponse(
      (response) =>
        response.url().endsWith("/commit") &&
        response.request().method() === "POST",
    );
    await online.getByRole("button", { name: "Valider le comptage" }).click();
    const committed = await committedResponse;
    expect(committed.status()).toBe(200);
    const result = inventoryCommitResponseSchema.parse(
      await committed.json(),
    ).result;
    expect(
      result.snapshots.find(
        (snapshot) => snapshot.productId === copy.selectedProduct.id,
      ),
    ).toMatchObject({
      onHandQuantity: 40.5,
      observedAt: payload.lines[0].observedAt,
    });
  } finally {
    await persistent.close();
  }
});

test("TECH-03 deux appareils comparent leurs saisies avant résolution explicite", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  const businessDate =
    testInfo.project.name === "mobile-390" ? "2025-10-22" : "2025-10-23";
  const copy = await prepare(page, businessDate);
  const otherContext = await browser.newContext({
    baseURL,
    storageState: await context.storageState(),
    viewport: testInfo.project.use.viewport,
  });
  try {
    const other = await otherContext.newPage();
    await prepare(other, businessDate, false);
    await context.setOffline(true);
    await otherContext.setOffline(true);
    await fill(page, "2");
    await fill(other, "7");
    await enable(page);
    await enable(other);
    await context.setOffline(false);
    await page.bringToFront();
    await connected(page);
    await expect(
      panel(page).getByText("Brouillon synchronisé", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await otherContext.setOffline(false);
    await other.bringToFront();
    await connected(other);
    await expect(
      panel(other).getByText("Conflit à résoudre", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await expect(panel(other).getByText(/Appareil : 7 colis/)).toBeVisible();
    await expect(panel(other).getByText(/Serveur : 2 colis/)).toBeVisible();
    await expect(
      panel(other).getByRole("button", {
        name: "Confirmer mes choix de résolution",
      }),
    ).toBeDisabled();
    await expect(
      row(other).getByLabel("Quantité en rayon", { exact: false }),
    ).toBeDisabled();
    await panel(other).scrollIntoViewIfNeeded();
    await other.screenshot({
      path: testInfo.outputPath(`sync-conflict-${testInfo.project.name}.png`),
    });
    await panel(other).getByLabel("Garder ma saisie", { exact: true }).check();
    await panel(other)
      .getByRole("button", { name: "Confirmer mes choix de résolution" })
      .click();
    await expect(
      panel(other).getByText("Brouillon synchronisé", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    const after = await serverCount(other, copy.identity.storeId, businessDate);
    expect(after.count).toMatchObject({
      revision: 2,
      status: "draft",
      lines: [{ reserveCaseCount: 7, shelfQuantity: 3.5 }],
    });
    expect(
      after.products.every((product) => product.daySnapshot === null),
    ).toBe(true);
    expect(
      await other.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await otherContext.close();
  }
});

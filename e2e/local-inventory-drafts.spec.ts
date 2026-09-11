import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { join } from "node:path";
import {
  offlineIdentitySchema,
  preparedWorkspaceSchema,
} from "@/domain/offline/schemas";
import { preparedFixture } from "@/test/fixtures/offline";
import { getDemoStorePair, importFixtureIntoStore } from "./demo-store";

async function prepare(page: Page, context: BrowserContext) {
  const { primary } = await getDemoStorePair(page);
  const access = await page.request.get(
    `/api/stores/${primary.id}/offline/access`,
  );
  const identity = offlineIdentitySchema.parse(await access.json());
  const now = Date.now();
  const copy = {
    ...preparedFixture(),
    identity,
    canWriteInventory: true,
    storeName: primary.name,
    preparedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 12 * 3600000).toISOString(),
    purgeAt: new Date(now + 24 * 3600000).toISOString(),
  };
  const endpoint = `**/api/stores/${primary.id}/offline?*`;
  await context.route(endpoint, (route) => route.fulfill({ json: copy }));
  await page.goto(
    `/offline?storeId=${primary.id}&businessDate=${copy.businessDate}`,
  );
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled({ timeout: 45000 });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(
    page.getByText("Prêt pour la consultation hors connexion", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Commencer un brouillon local" })
    .click();
  await saved(page);
  return { copy, endpoint };
}
const saved = (page: Page) =>
  expect(
    page.getByText("Enregistré sur cet appareil · non synchronisé", {
      exact: true,
    }),
  ).toBeVisible();
const article = (page: Page) =>
  page.locator("[data-local-count-product]").first();

test("TECH-02 conserve valeurs brutes, filtres et colisage sans écriture serveur", async ({
  page,
  context,
}, testInfo) => {
  const { copy, endpoint } = await prepare(page, context);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/") &&
      !["GET", "HEAD"].includes(request.method())
    )
      mutations.push(request.url());
  });
  await context.setOffline(true);
  await expect(article(page)).toBeVisible();
  await article(page)
    .getByRole("combobox", { name: "Famille", exact: true })
    .selectOption("3400");
  await article(page)
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("kg");
  await article(page).getByLabel("Colisage du relevé").fill("18,5");
  await article(page).getByLabel("Colis en réserve").fill("0");
  await saved(page);
  await page.getByRole("button", { name: "Rayon", exact: true }).click();
  await article(page)
    .getByLabel("Quantité en rayon", { exact: false })
    .fill("1,");
  await page.getByLabel("Rechercher dans le brouillon").fill("Article 001");
  await saved(page);
  await page.reload();
  await expect(page.getByLabel("Rechercher dans le brouillon")).toHaveValue(
    "Article 001",
  );
  await expect(
    article(page).getByLabel("Quantité en rayon", { exact: false }),
  ).toHaveValue("1,");
  await expect(article(page).getByLabel("Colisage du relevé")).toHaveValue(
    "18,5",
  );
  await expect(article(page).getByText(/Réserve : 0 colis/)).toBeVisible();
  await article(page)
    .getByLabel("Quantité en rayon", { exact: false })
    .fill("0");
  await saved(page);
  await expect(
    article(page).getByText("Complet localement · total 0 kg"),
  ).toBeVisible();

  await context.setOffline(false);
  // Network emulation does not always dispatch a browser online event.
  const recheck = page.getByRole("button", {
    name: "Vérifier le retour du réseau",
  });
  if (await recheck.isVisible()) await recheck.click();
  await context.unroute(endpoint);
  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route(endpoint, async (route) => {
    started();
    await delayed;
    await route.fulfill({
      json: {
        ...copy,
        dataRevision: 100,
        products: copy.products.map((product) => ({
          ...product,
          profile: {
            familyCode: "3402",
            stockUnit: "piece",
            lastPackSize: 99,
            revision: 2,
          },
        })),
      },
    });
  });
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await requested;
  await article(page)
    .getByLabel("Quantité en rayon", { exact: false })
    .fill("3,5");
  await saved(page);
  release();
  await expect(
    page.getByText(/52 articles · données révision 100/),
  ).toBeVisible();
  await expect(
    article(page).getByLabel("Quantité en rayon", { exact: false }),
  ).toHaveValue("3,5");
  await expect(article(page).getByLabel("Colisage du relevé")).toHaveValue(
    "18,5",
  );
  expect(mutations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`local-draft-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("TECH-02 n’annonce pas de sauvegarde sur quota refusé et garde la saisie après un focus", async ({
  page,
  context,
}) => {
  await prepare(page, context);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "drafts")
        throw new DOMException("Espace local épuisé", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener(
      "restore-idb",
      () => {
        IDBObjectStore.prototype.put = original;
      },
      { once: true },
    );
  });
  await article(page).getByLabel("Colis en réserve").fill("7");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Non enregistré sur cet appareil",
  );
  await expect(
    page.getByText("Enregistré sur cet appareil · non synchronisé", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(article(page).getByLabel("Colis en réserve")).toHaveValue("7");
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("restore-idb")));
  await page
    .getByRole("button", { name: "Réessayer l’enregistrement local" })
    .click();
  await saved(page);
  await page.reload();
  await expect(article(page).getByLabel("Colis en réserve")).toHaveValue("7");
});

test("TECH-02 renouvelle une copie expirée sans perdre une saisie en échec", async ({
  page,
  context,
}) => {
  const { copy, endpoint } = await prepare(page, context);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "drafts")
        throw new DOMException("Quota", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener(
      "restore-idb",
      () => {
        IDBObjectStore.prototype.put = original;
      },
      { once: true },
    );
  });
  await article(page).getByLabel("Colis en réserve").fill("8");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Non enregistré",
  );
  const later = Date.parse(copy.expiresAt) + 1000;
  await page.clock.setFixedTime(new Date(later));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText(/Copie expirée ou horloge incohérente/),
  ).toBeVisible();
  await expect(page.locator("[data-local-count-product]")).toHaveCount(0);
  await context.unroute(endpoint);
  await context.route(endpoint, (route) =>
    route.fulfill({
      json: {
        ...copy,
        preparedAt: new Date(later).toISOString(),
        expiresAt: new Date(later + 3600000).toISOString(),
        purgeAt: new Date(later + 7200000).toISOString(),
      },
    }),
  );
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(article(page).getByLabel("Colis en réserve")).toHaveValue("8");
  await page.evaluate(() => window.dispatchEvent(new Event("restore-idb")));
  await page
    .getByRole("button", { name: "Réessayer l’enregistrement local" })
    .click();
  await saved(page);
  await page.reload();
  await expect(article(page).getByLabel("Colis en réserve")).toHaveValue("8");
});

test("TECH-02 retrouve le brouillon après arrêt complet Chromium", async ({
  context,
  baseURL,
}, testInfo) => {
  const profile = testInfo.outputPath("local-draft-profile");
  let persistent = await chromium.launchPersistentContext(profile, {
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    await persistent.addCookies(await context.cookies());
    let page = await persistent.newPage();
    await prepare(page, persistent);
    await article(page).getByLabel("Colisage du relevé").fill("9");
    await article(page).getByLabel("Colis en réserve").fill("2");
    await saved(page);
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, {
      baseURL,
      viewport: testInfo.project.use.viewport,
    });
    await persistent.setOffline(true);
    page = await persistent.newPage();
    await page.goto("/offline");
    await expect(article(page).getByLabel("Colis en réserve")).toHaveValue("2");
    await expect(article(page).getByLabel("Colisage du relevé")).toHaveValue(
      "9",
    );
    await saved(page);
  } finally {
    await persistent.close();
  }
});

test("TECH-02 verrouille au changement de compte et récupère seulement avec le propriétaire", async ({
  page,
  context,
}) => {
  const { copy } = await prepare(page, context);
  await article(page).getByLabel("Colis en réserve").fill("4");
  await saved(page);
  const other = await context.newPage();
  await other.goto("/sign-in");
  await other.getByLabel("Adresse e-mail").fill("manager@fleg.local");
  await other.getByLabel("Mot de passe").fill("FlegManager!2026");
  await other.getByRole("button", { name: "Se connecter" }).click();
  await expect(other).toHaveURL(/\/stores$/);
  await expect(page.locator("[data-local-count-product]")).toHaveCount(0);
  await context.unrouteAll();
  await other.goto("/sign-in");
  await other.getByLabel("Adresse e-mail").fill("admin@fleg.local");
  await other.getByLabel("Mot de passe").fill("FlegDemo!2026");
  await other.getByRole("button", { name: "Se connecter" }).click();
  await expect(other).toHaveURL(/\/stores$/);
  const access = await other.request.get(
    `/api/stores/${copy.identity.storeId}/offline/access`,
  );
  const identity = offlineIdentitySchema.parse(await access.json());
  await context.route(
    `**/api/stores/${copy.identity.storeId}/offline?*`,
    (route) => route.fulfill({ json: { ...copy, identity } }),
  );
  await other.goto(
    `/offline?storeId=${copy.identity.storeId}&businessDate=${copy.businessDate}`,
  );
  await expect(
    other.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled({ timeout: 45000 });
  await other.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(article(other).getByLabel("Colis en réserve")).toHaveValue("4");
});

test("TECH-02 compte hors ligne depuis un vrai catalogue Mercalys préparé par le serveur", async ({
  page,
  context,
}, testInfo) => {
  const { primary } = await getDemoStorePair(page);
  await importFixtureIntoStore({
    page,
    storeId: primary.id,
    // Reuse the baseline month; do not advance other recipes' default period.
    fileName: "10_2025.xlsx",
    fixturePath: join(
      process.cwd(),
      "assets/import_excel_files_examples/10_2025.xlsx",
    ),
  });
  const endpoint = `/api/stores/${primary.id}/offline?businessDate=2026-09-11`;
  const beforeResponse = await page.request.get(endpoint);
  expect(beforeResponse.status()).toBe(200);
  const before = preparedWorkspaceSchema.parse(await beforeResponse.json());
  expect(before.products.length).toBeGreaterThan(100);
  expect(before.canWriteInventory).toBe(true);
  const product = before.products.find((value) => /banane/i.test(value.label))!;
  expect(product).toBeDefined();
  await page.goto(`/offline?storeId=${primary.id}&businessDate=2026-09-11`);
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled({ timeout: 45000 });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await page
    .getByRole("button", { name: "Commencer un brouillon local" })
    .click();
  await saved(page);
  await context.setOffline(true);
  await page.getByLabel("Rechercher dans le brouillon").fill(product.label);
  const row = page.locator("[data-local-count-product]").filter({
    has: page.getByRole("heading", { name: product.label, exact: true }),
  });
  await row
    .getByRole("combobox", { name: "Famille", exact: true })
    .selectOption("3400");
  await row
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("kg");
  await row.getByLabel("Colisage du relevé").fill("18,5");
  await row.getByLabel("Colis en réserve").fill("2");
  await page.getByRole("button", { name: "Rayon", exact: true }).click();
  await row.getByLabel("Quantité en rayon", { exact: false }).fill("3,5");
  await saved(page);
  await page.reload();
  await expect(
    row.getByText("Complet localement · total 40.5 kg"),
  ).toBeVisible();
  await expect(row.getByLabel("Colisage du relevé")).toHaveValue("18,5");
  await page.screenshot({
    path: testInfo.outputPath(
      `mercalys-local-count-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await row.screenshot({
    path: testInfo.outputPath(`count-line-${testInfo.project.name}.png`),
  });
  await context.setOffline(false);
  const afterResponse = await page.request.get(endpoint);
  const after = preparedWorkspaceSchema.parse(await afterResponse.json());
  expect(after.countReference).toEqual(before.countReference);
  expect(after.products).toEqual(before.products);
  expect(after.dataRevision).toBe(before.dataRevision);
});

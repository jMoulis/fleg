import {
  chromium,
  expect,
  test,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import {
  preparedWorkspaceSchema,
  offlineIdentitySchema,
} from "@/domain/offline/schemas";
import { preparedFixture } from "@/test/fixtures/offline";
import { getDemoStorePair } from "./demo-store";

async function reference(page: Page) {
  const { primary, control } = await getDemoStorePair(page);
  const access = await page.request.get(
    `/api/stores/${primary.id}/offline/access`,
  );
  expect(access.status()).toBe(200);
  const identity = offlineIdentitySchema.parse(await access.json());
  const now = Date.now();
  return {
    control,
    copy: preparedWorkspaceSchema.parse({
      ...preparedFixture(),
      identity,
      storeName: primary.name,
      preparedAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 12 * 3_600_000).toISOString(),
      purgeAt: new Date(now + 24 * 3_600_000).toISOString(),
    }),
  };
}

async function prepareFixture(page: Page, context: BrowserContext) {
  const { copy, control } = await reference(page);
  const endpoint = `**/api/stores/${copy.identity.storeId}/offline?*`;
  await context.route(endpoint, (route) => route.fulfill({ json: copy }));
  await page.goto(
    `/offline?storeId=${copy.identity.storeId}&businessDate=${copy.businessDate}`,
  );
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeEnabled({ timeout: 45_000 });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(
    page.getByText("Prêt pour la consultation hors connexion", { exact: true }),
  ).toBeVisible();
  return { copy, control, endpoint };
}

test("TECH-01 ouvre à froid tout le catalogue préparé, sans cache privé", async ({
  page,
  context,
}) => {
  const { copy, control } = await prepareFixture(page, context);
  await expect(page.locator("[data-offline-product]")).toHaveCount(25);
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/offline");
  await expect(
    reopened.getByRole("heading", { name: "Catalogue préparé" }),
  ).toBeVisible();
  await reopened.getByLabel("Rechercher un article").fill("Article 052");
  await expect(reopened.locator("[data-offline-product]")).toHaveCount(1);
  await reopened.reload();
  await reopened.getByRole("button", { name: "Suivante" }).click();
  await reopened.getByRole("button", { name: "Suivante" }).click();
  await expect(
    reopened.getByRole("heading", { name: "Article 052" }),
  ).toBeVisible();

  const cachedUrls = await reopened.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(cachedUrls.some((url) => url.includes("/offline"))).toBe(true);
  expect(
    cachedUrls.every((url) =>
      /\/_next\/static\/|\/offline\?|\/pwa-(192|512)\.png/.test(url),
    ),
  ).toBe(true);
  expect(
    cachedUrls.some(
      (url) =>
        new URL(url).pathname.startsWith("/api/") ||
        url.includes(copy.identity.storeId),
    ),
  ).toBe(false);
  await reopened.goto(
    `/offline?storeId=${control.id}&businessDate=${copy.businessDate}`,
  );
  await expect(
    reopened.getByRole("heading", { name: "Catalogue préparé" }),
  ).toHaveCount(0);
  await expect(reopened.getByText(/Aucun catalogue préparé/)).toBeVisible();
});

test("TECH-01 refuse le téléchargement partiel, expire la copie et permet son effacement", async ({
  page,
  context,
}) => {
  const { copy, endpoint } = await prepareFixture(page, context);
  await context.unroute(endpoint);
  await context.route(endpoint, (route) =>
    route.fulfill({ json: { ...copy, products: [] } }),
  );
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "incomplète",
  );
  await expect(page.locator("[data-offline-product]")).toHaveCount(25);
  await context.setOffline(true);
  await page.clock.install({ time: new Date(copy.expiresAt) });
  await page.reload();
  await expect(
    page.getByText(/Copie expirée ou horloge incohérente/),
  ).toBeVisible();
  await expect(page.locator("[data-offline-product]")).toHaveCount(0);
  await page.getByRole("button", { name: "Effacer la copie locale" }).click();
  await expect(page.getByText(/Aucun catalogue préparé/)).toBeVisible();
});

test("TECH-01 efface la référence lors d’un changement de compte", async ({
  page,
  context,
}) => {
  const { control } = await prepareFixture(page, context);
  const other = await context.newPage();
  await other.goto("/sign-in");
  await other.getByLabel("Adresse e-mail").fill("manager@fleg.local");
  await other.getByLabel("Mot de passe").fill("FlegManager!2026");
  await other.getByRole("button", { name: "Se connecter" }).click();
  await expect(other).toHaveURL(/\/stores$/);
  await expect(page.getByText(/Aucun catalogue préparé/)).toBeVisible();
  await expect(page.locator("[data-offline-product]")).toHaveCount(0);
  expect(
    (
      await other.request.get(
        `/api/stores/${control.id}/offline?businessDate=2026-09-11`,
      )
    ).status(),
  ).toBe(404);
});

test("TECH-01 prépare une vraie réponse autorisée et refuse un magasin étranger", async ({
  page,
}) => {
  const { primary } = await getDemoStorePair(page);
  const response = await page.request.get(
    `/api/stores/${primary.id}/offline?businessDate=2026-09-11`,
  );
  expect(response.status()).toBe(200);
  const copy = preparedWorkspaceSchema.parse(await response.json());
  expect(copy.identity.storeId).toBe(primary.id);
  expect(copy.products.length).toBe(copy.productCount);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await page.request.get(
        "/api/stores/000000000000000000000000/offline?businessDate=2026-09-11",
      )
    ).status(),
  ).toBe(404);
});

test("TECH-01 signale un stockage indisponible sans annoncer une préparation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    }),
  );
  await page.goto("/offline");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("Prêt pour la consultation hors connexion", { exact: true }),
  ).toHaveCount(0);
});

test("TECH-01 détecte le manque de place et un cache statique incomplet", async ({
  page,
  context,
}) => {
  await prepareFixture(page, context);
  await page.evaluate(() => {
    navigator.storage.estimate = async () => ({ usage: 100, quota: 100 });
  });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Espace insuffisant",
  );
  await expect(page.locator("[data-offline-product]")).toHaveCount(25);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys())
        if (new URL(request.url).pathname === "/offline")
          await cache.delete(request);
    }
  });
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Application locale incomplète",
  );
});

test("TECH-01 garde la référence après arrêt du navigateur et ne force pas une mise à jour", async ({
  context,
  baseURL,
}, testInfo) => {
  const profilePath = testInfo.outputPath("persistent-profile");
  let persistent = await chromium.launchPersistentContext(profilePath, {
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    await persistent.addCookies(await context.cookies());
    const page = await persistent.newPage();
    const { primary } = await getDemoStorePair(page);
    await page.goto(`/offline?storeId=${primary.id}&businessDate=2026-09-11`);
    await expect(
      page.getByRole("button", { name: "Préparer ce catalogue" }),
    ).toBeEnabled({ timeout: 45_000 });
    await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
    await expect(
      page.getByText("Prêt pour la consultation hors connexion", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Rechercher un article").fill("banane");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js?update-test=1", {
        scope: "/",
      });
    });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          Boolean(
            (await navigator.serviceWorker.getRegistration("/"))?.waiting,
          ),
        ),
      )
      .toBe(true);
    await expect(page.getByText(/Mise à jour disponible/)).toBeVisible();
    await expect(page.getByLabel("Rechercher un article")).toHaveValue(
      "banane",
    );
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profilePath, {
      baseURL,
      viewport: testInfo.project.use.viewport,
    });
    await persistent.setOffline(true);
    const reopened = await persistent.newPage();
    await reopened.goto("/offline");
    await expect(
      reopened.getByText("Prêt pour la consultation hors connexion", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      reopened.getByRole("heading", { name: "Catalogue préparé" }),
    ).toBeVisible();
    await reopened
      .getByRole("link", { name: /Consulter les .* articles/ })
      .click();
    await expect(reopened.getByLabel("Rechercher un article")).toBeInViewport();
    await reopened.screenshot({
      path: testInfo.outputPath(`offline-${testInfo.project.name}.png`),
      fullPage: false,
    });
  } finally {
    await persistent.close();
  }
});

test("TECH-01 invalide aussi depuis le worker avant une mutation auth refusée", async ({
  page,
  context,
}) => {
  await prepareFixture(page, context);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const status = await page.evaluate(
    async () =>
      (await fetch("/api/auth/offline-invalidation-probe", { method: "POST" }))
        .status,
  );
  expect(status).toBe(404);
  await expect(page.getByText(/Aucun catalogue préparé/)).toBeVisible();
  await expect(page.locator("[data-offline-product]")).toHaveCount(0);
});

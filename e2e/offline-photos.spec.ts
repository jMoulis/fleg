import { chromium, expect, test } from "@playwright/test";
import { preparedPhotosSchema } from "@/domain/attachments/photo-queue";
import { getDemoStorePair } from "./demo-store";

test("TECH-04 conserve une photo après arrêt et réouverture hors connexion, sans cache privé", async ({
  context,
  baseURL,
}, testInfo) => {
  const profile = testInfo.outputPath("photo-profile");
  let persistent = await chromium.launchPersistentContext(profile, {
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  try {
    await persistent.addCookies(await context.cookies());
    let page = await persistent.newPage();
    const { primary } = await getDemoStorePair(page);
    const endpoint = `/api/stores/${primary.id}/attachments/offline`;
    const result = await page.request.post(endpoint, {
      headers: { Origin: baseURL! },
      data: { target: { type: "store" }, label: "Magasin terrain" },
    });
    expect(result.status()).toBe(200);
    const copy = preparedPhotosSchema.parse(await result.json());
    expect(
      (
        await page.request.get(
          `/api/stores/000000000000000000000000/attachments/offline`,
        )
      ).status(),
    ).toBe(404);
    await page.goto("/offline#offline-photos");
    await expect
      .poll(
        () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
        { timeout: 45000 },
      )
      .toBe(true);
    // Restore an explicitly prepared reference, as if consent was given in the
    // photothèque. The actual checkbox/preparation UI is covered in Chromium's
    // isolated photo-library recipe; this test focuses on the production SW.
    await page.evaluate(async (value) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("fleg-offline-reference-v1");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("copies", "readwrite");
          tx.objectStore("copies").put({ key: "photos", value });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    }, copy);
    await page.reload();
    await expect(
      page.getByLabel("Photo à conserver", { exact: true }),
    ).toBeVisible();
    await persistent.setOffline(true);
    await page.getByLabel("Photo à conserver", { exact: true }).setInputFiles({
      name: "terrain-offline.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page
      .getByRole("button", { name: "Conserver et envoyer dès que possible" })
      .click();
    await expect(page.getByText(/1 photo\(s\) en attente/)).toBeVisible();
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, {
      baseURL,
      viewport: testInfo.project.use.viewport,
    });
    await persistent.setOffline(true);
    page = await persistent.newPage();
    await page.goto("/offline#offline-photos");
    await expect(
      page.getByText("Magasin terrain · terrain-offline.png", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(/1 photo\(s\) en attente/)).toBeVisible();
    // Chromium can report onLine=true after reload despite network emulation.
    // Prove an uncached API call actually fails instead of trusting that hint.
    expect(
      await page.evaluate(async () => {
        try {
          await fetch(`/api/health?offlinePhotoProbe=${Date.now()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys())
        for (const req of await (await caches.open(key)).keys())
          urls.push(req.url);
      return urls;
    });
    expect(
      cached.filter(
        (url) =>
          new URL(url).pathname.startsWith("/api/") ||
          url.includes(primary.id) ||
          url.includes("terrain-offline"),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("offline-photos.png"),
      fullPage: true,
    });
    await persistent.setOffline(false);
    await page.evaluate(async () => {
      await fetch("/api/auth/offline-photo-invalidation-probe", {
        method: "POST",
      });
    });
    await expect(
      page.getByText("Magasin terrain · terrain-offline.png", { exact: true }),
    ).toHaveCount(0);
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open("fleg-offline-reference-v1");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("photos");
            const count = tx.objectStore("photos").count();
            count.onsuccess = () => resolve(count.result);
            tx.oncomplete = () => db.close();
          };
        }),
    );
    expect(count).toBe(1); // invalidating preparation must not delete pending bytes.
  } finally {
    await persistent.close();
  }
});

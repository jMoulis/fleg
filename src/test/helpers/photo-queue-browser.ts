import { expect, type Browser } from "@playwright/test";
import { join } from "node:path";

// Real components + IndexedDB; simulated server/Blob boundary. Cold launch has
// a separate production E2E, not a claim based on this development fixture.
export async function verifyPhotoQueue(
  browser: Browser,
  origin: string,
  root: string,
) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    const base = `/api/stores/${"a".repeat(24)}/attachments`;
    const identity = {
      userId: "synthetic-manager",
      organizationId: "org",
      storeId: "a".repeat(24),
      sessionBinding: "a".repeat(64),
    };
    let allowUpload = false,
      verified = false,
      puts = 0,
      reservations = 0,
      checks = 0,
      galleryReads = 0;
    const id = "8b288c1c-9a78-4a8e-8f5e-ea08b7f6e7d5";
    const receipt = {
      id,
      state: "reserved",
      createdAt: new Date().toISOString(),
      reconcileAfter: new Date().toISOString(),
      uploadAvailable: true,
    };
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === "https://vercel.com") {
          puts++;
          return route.abort("failed");
        }
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith(base)) return route.continue();
        if (url.pathname === base && request.method() === "GET") {
          galleryReads++;
          return route.fulfill({ json: { attachments: [] } });
        }
        if (url.pathname.endsWith("/offline")) {
          if (request.method() === "GET")
            return route.fulfill({
              json: { ...identity, uploadsAvailable: allowUpload },
            });
          return route.fulfill({
            json: {
              schemaVersion: 1,
              identity,
              storeName: "Magasin de test",
              preparedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              targets: [request.postDataJSON()],
            },
          });
        }
        if (url.pathname.endsWith("/content"))
          return route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              "base64",
            ),
          });
        if (url.pathname.endsWith("/authorization"))
          return route.fulfill({
            json: {
              upload: {
                method: "PUT",
                url: "https://vercel.com/api/blob/?signed=synthetic",
                contentType: "image/png",
                headers: { "x-content-type": "image/png" },
                validUntil: new Date(Date.now() + 60000).toISOString(),
              },
            },
          });
        if (url.pathname.endsWith("/verify")) {
          checks++;
          return route.fulfill({
            json: {
              intent: {
                ...receipt,
                state: verified ? "linked" : "uploaded",
                receivedAt: receipt.createdAt,
                reconcileAfter: new Date(Date.now() + 300000).toISOString(),
              },
            },
          });
        }
        if (url.pathname.endsWith("/upload-intents")) {
          reservations++;
          expect(request.postDataJSON()).toMatchObject({
            target: { type: "store" },
            caption: "Matin",
          });
          expect(JSON.parse(request.headers()["x-fleg-photo-owner"]!)).toEqual(
            identity,
          );
          return route.fulfill({ json: { intent: receipt } });
        }
        return route.abort();
      });
      await page.goto(`${origin}/photos`);
      await page.getByText("Photos hors connexion", { exact: true }).click();
      await page
        .getByText("Préparer « Magasin » hors connexion", { exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Préparer cette cible", exact: true }),
      ).toBeDisabled();
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Préparer cette cible", exact: true })
        .click();
      await expect(
        page.getByLabel("Photo à conserver", { exact: true }),
      ).toBeVisible();
      await context.setOffline(true);
      await page
        .getByLabel("Photo à conserver", { exact: true })
        .setInputFiles({
          name: "terrain.png",
          mimeType: "image/png",
          buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        });
      await page.getByLabel("Légende de la photo locale").fill("Matin");
      await page
        .getByRole("button", { name: "Conserver et envoyer dès que possible" })
        .click();
      await expect(page.getByText(/1 photo\(s\) en attente/)).toBeVisible();
      expect(puts).toBe(0);
      expect(reservations).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(root, ".local-backups", `photo-queue-${width}.png`),
        fullPage: true,
      });
      await context.setOffline(false);
      await page.goto(`${origin}/photos?user=other`);
      await page.getByText("Photos hors connexion", { exact: true }).click();
      await expect(page.getByText(/1 photo\(s\) en attente/)).toHaveCount(0);
      expect(puts).toBe(0);
      allowUpload = true;
      await page.goto(`${origin}/photos`);
      await page.getByText("Photos hors connexion", { exact: true }).click();
      await expect(
        page.getByText("Réception à vérifier · aucun nouvel envoi du fichier"),
      ).toBeVisible();
      expect(puts).toBe(1);
      expect(reservations).toBe(1);
      verified = true;
      await page.reload();
      await page.getByText("Photos hors connexion", { exact: true }).click();
      await page
        .getByRole("button", { name: "Reprendre la vérification" })
        .click();
      await expect(page.getByText(/0 photo\(s\) en attente/)).toBeVisible();
      await expect.poll(() => galleryReads).toBe(1);
      expect(puts).toBe(1);
      expect(reservations).toBe(1);
      expect(checks).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
}

import { expect, type Browser } from "@playwright/test";
import { join } from "node:path";
import { attachmentPolicy } from "@/domain/attachments/schemas";
import { legacyPhoto } from "./photo-library-browser-fixture";

// Real application components + stylesheet. Only the external/API boundary is
// simulated here; the separate MongoDB suite exercises real linkage/isolation.
export async function verifyPhotoLibrary(
  browser: Browser,
  origin: string,
  root: string,
) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    try {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      const id = "b19b0d96-8c71-466e-a1d5-2a18ed06e358";
      const base = `/api/stores/${"a".repeat(24)}/attachments`;
      const receipt = {
        id,
        state: "reserved",
        createdAt: new Date().toISOString(),
        reconcileAfter: new Date().toISOString(),
        uploadAvailable: false,
      };
      const added = {
        ...legacyPhoto,
        id: "c".repeat(24),
        caption: "Rayon du matin",
        originalFileName: "rayon.png",
        storageBackend: "vercel_blob",
        contentUrl: `${base}/${"c".repeat(24)}/content`,
      };
      let puts = 0;
      let checks = 0;
      let reservations = 0;
      let linked = false;
      let removed = false;
      let legacyDeleted = false;
      let hold = true;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (
          url.origin === "https://vercel.com" &&
          url.pathname === "/api/blob/"
        ) {
          puts++;
          expect(route.request().headers()["cookie"]).toBeUndefined();
          // Emulate a lost provider acknowledgement after bytes were sent.
          return route.abort("failed");
        }
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith(base)) return route.continue();
        if (url.pathname.endsWith("/content"))
          return route.fulfill({ contentType: "image/png", body: png });
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
          linked = !hold;
          return route.fulfill({
            json: {
              intent: {
                ...receipt,
                state: hold ? "uploaded" : "linked",
                receivedAt: receipt.createdAt,
                reconcileAfter: new Date(Date.now() + 300000).toISOString(),
              },
            },
          });
        }
        if (url.pathname.endsWith("/upload-intents")) {
          reservations++;
          expect(route.request().postDataJSON()).toMatchObject({
            kind: "photo",
            target: { type: "store" },
            mimeType: "image/png",
            caption: "Rayon du matin",
          });
          return route.fulfill({ json: { intent: receipt } });
        }
        if (url.pathname.endsWith("/remove")) {
          expect(url.pathname).toBe(`${base}/sources/${added.id}/remove`);
          removed = true;
          return route.fulfill({
            status: 202,
            json: { state: "deleting", deletionComplete: false },
          });
        }
        if (route.request().method() === "DELETE") {
          expect(url.pathname).toBe(`${base}/${legacyPhoto.id}`);
          legacyDeleted = true;
          return route.fulfill({
            json: { deletedAttachment: legacyPhoto, requestId: id },
          });
        }
        expect(route.request().method()).toBe("GET");
        return route.fulfill({
          json: {
            attachments: [
              ...(legacyDeleted ? [] : [legacyPhoto]),
              ...(linked && !removed ? [added] : []),
            ],
            policy: attachmentPolicy,
            requestId: id,
          },
        });
      });
      await page.goto(`${origin}/photos`);
      await page
        .getByLabel("Photo", { exact: true })
        .setInputFiles({
          name: "rayon.png",
          mimeType: "image/png",
          buffer: png,
        });
      await page.getByLabel("Légende facultative").fill("Rayon du matin");
      await page
        .getByRole("button", { name: "Ajouter la photo", exact: true })
        .click();
      await expect(
        page.getByText(/Photo reçue.*Vérification à reprendre/),
      ).toBeVisible();
      expect(puts).toBe(1);
      expect(reservations).toBe(1);
      expect(checks).toBe(1);
      await page.goto(`${origin}/photos?user=other`);
      await expect(
        page.getByRole("button", { name: "Ajouter la photo", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Vérifier la réception" }),
      ).toHaveCount(0);
      expect(checks).toBe(1);
      hold = false;
      await page.goto(`${origin}/photos`);
      await expect(
        page.getByText(
          "Photo vérifiée et ajoutée. La géométrie du plan reste inchangée.",
        ),
      ).toBeVisible();
      expect(puts).toBe(1);
      expect(reservations).toBe(1);
      expect(checks).toBe(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: join(root, ".local-backups", `photo-blob-${width}.png`),
        fullPage: true,
      });
      const addedCard = page
        .locator("article")
        .filter({ hasText: "Rayon du matin" });
      await addedCard
        .getByRole("button", { name: "Supprimer", exact: true })
        .click();
      await addedCard
        .getByRole("button", { name: "Confirmer", exact: true })
        .click();
      await expect(
        page.getByText(
          "Photo retirée. Le nettoyage du stockage est en attente.",
        ),
      ).toBeVisible();
      expect(removed).toBe(true);
      const legacyCard = page
        .locator("article")
        .filter({ hasText: "Photo historique" });
      await legacyCard
        .getByRole("button", { name: "Supprimer", exact: true })
        .click();
      await legacyCard
        .getByRole("button", { name: "Confirmer", exact: true })
        .click();
      await expect(
        page.getByText(
          "Photo supprimée définitivement. La trace d’audit est conservée.",
        ),
      ).toBeVisible();
      expect(legacyDeleted).toBe(true);
      await page.goto(`${origin}/photos?disabled=true`);
      await expect(
        page.getByText("Envoi indisponible", { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Photo", { exact: true })).toHaveCount(0);
      expect(puts).toBe(1);
    } finally {
      await page.close();
    }
  }
}

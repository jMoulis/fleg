import { expect, type Locator, type Page } from "@playwright/test";
import {
  createLocalInventoryDraft,
  draftScope,
} from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";

/** Simulate the persisted TECH-02 format: these recipes prove recovery without implied consent. */
export async function restoreLegacyDraft(page: Page, copy: PreparedWorkspace) {
  await expect(page.getByText("Catalogue prêt", { exact: true })).toBeVisible({
    timeout: 45000,
  });
  const value = createLocalInventoryDraft(
    copy,
    new Date().toISOString(),
    crypto.randomUUID(),
  );
  await page.evaluate(
    async (record) => {
      const databases = await indexedDB.databases();
      const name = databases.find((db) => db.name?.includes("fleg"))?.name;
      if (!name) throw new Error("Prepared database absent");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").put(record);
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
    },
    { key: draftScope(copy), value },
  );
  await page.reload();
}

export async function openPreparation(page: Page) {
  await expect(page.locator("#preparation-title")).not.toContainText(
    "Vérification du catalogue",
  );
  const preparation = page.locator(
    "details[aria-labelledby='preparation-title']",
  );
  if (!(await preparation.evaluate((element) => element.hasAttribute("open"))))
    await page.locator("#preparation-title").click();
  await expect(
    page.getByRole("button", { name: "Préparer ce catalogue" }),
  ).toBeVisible();
}

export async function prepareCatalogue(page: Page) {
  await openPreparation(page);
  await page.getByRole("button", { name: "Préparer ce catalogue" }).click();
}

export async function openProductConfiguration(row: Locator) {
  const unit = row.getByRole("combobox", { name: "Unité", exact: true });
  if (!(await unit.isVisible())) await row.locator("summary").first().click();
  await expect(unit).toBeVisible();
}

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDemoStorePair } from "./demo-store";

test("TECH-04 Documents reste consultable sans activer Blob dans la CI", async ({
  page,
}) => {
  const stores = await getDemoStorePair(page);
  const base = `/reseau-fl-demo/stores/${stores.primary.id}`;
  await page.goto(`${base}/dashboard`);
  const link = page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Documents", exact: true });
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("L’envoi de PDF n’est pas activé", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun document enregistré pour le moment."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Envoyer le PDF" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const apiBase = `/api/stores/${stores.primary.id}/attachments`;
  const list = await page.request.get(`${apiBase}/documents`);
  expect(list.status()).toBe(200);
  expect(await list.json()).toMatchObject({ sources: [], nextCursor: null });
  for (const command of ["authorization", "verify"]) {
    const response = await page.request.post(
      `${apiBase}/upload-intents/${randomUUID()}/${command}`,
      { data: {}, headers: { Origin: "http://localhost:3100" } },
    );
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ code: "STORAGE_DISABLED" });
  }
  const foreign = await page.request.get(
    `/api/stores/000000000000000000000001/attachments/documents`,
  );
  expect(foreign.status()).toBe(404);
});

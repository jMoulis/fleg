import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

import {
  importCommitResponseSchema,
  importPreviewResponseSchema,
} from "@/domain/imports/schemas";
import { storesResponseSchema, type StoreSummary } from "@/domain/stores/schemas";

export const primaryDemoStoreLabel = "Magasin F&L Démo · DEMO-01";

export async function selectPrimaryDemoStore(page: Page): Promise<void> {
  const selector = page.getByRole("combobox", { name: "Magasin actif" });
  await expect(selector).toBeVisible();
  await selector.click();
  await page
    .getByRole("option", { name: primaryDemoStoreLabel, exact: true })
    .click();
  await expect(selector).toContainText(primaryDemoStoreLabel);
}

export async function getDemoStorePair(page: Page): Promise<{
  primary: StoreSummary;
  control: StoreSummary;
}> {
  const response = await page.request.get("/api/stores");
  expect(response.status()).toBe(200);
  const result = storesResponseSchema.parse(await response.json());
  const primary = result.stores.find(({ code }) => code === "DEMO-01");
  const control = result.stores.find(({ code }) => code === "DEMO-02");

  expect(primary, "Le seed doit exposer DEMO-01").toBeDefined();
  expect(control, "Le seed doit exposer DEMO-02").toBeDefined();
  if (!primary || !control) {
    throw new Error("Les deux magasins de recette sont requis");
  }

  return { primary, control };
}

export async function importFixtureIntoStore(input: {
  fileName: string;
  fixturePath: string;
  page: Page;
  storeId: string;
}): Promise<string> {
  const buffer = await readFile(input.fixturePath);
  const previewResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/imports/preview`,
    {
      multipart: {
        file: {
          name: input.fileName,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        },
      },
    },
  );
  expect(previewResponse.status()).toBe(200);
  const preview = importPreviewResponseSchema.parse(
    await previewResponse.json(),
  );
  const commitResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/imports/${preview.importId}/commit`,
    {
      data: {
        resolutions: preview.unresolvedAliases.map((alias) => ({
          externalKey: alias.externalKey,
          action: "create" as const,
          canonicalLabel: alias.sourceLabel,
        })),
      },
    },
  );
  expect(commitResponse.status()).toBe(200);
  const commit = importCommitResponseSchema.parse(await commitResponse.json());
  expect(commit.importedFactCount).toBeGreaterThan(0);

  return preview.periodKey;
}

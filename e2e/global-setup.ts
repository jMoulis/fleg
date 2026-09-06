import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium, expect, type FullConfig } from "@playwright/test";

const credentials = {
  email: process.env.E2E_EMAIL ?? "admin@fleg.local",
  password: process.env.E2E_PASSWORD ?? "FlegDemo!2026",
};

export const authenticationStatePath = "test-results/.auth/admin.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("PLAYWRIGHT_BASE_URL doit être une URL valide.");
  }

  const absoluteStatePath = resolve(process.cwd(), authenticationStatePath);
  await mkdir(dirname(absoluteStatePath), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Adresse e-mail").fill(credentials.email);
    await page.getByLabel("Mot de passe").fill(credentials.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/stores$/);
    await expect(
      page.getByRole("heading", { name: "Choisissez votre magasin" }),
    ).toBeVisible();
    await context.storageState({ path: absoluteStatePath });
  } finally {
    await context.close();
    await browser.close();
  }
}

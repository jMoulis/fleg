import { expect, type Locator, type Page } from "@playwright/test";

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

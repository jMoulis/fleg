import { expect, type Browser } from "@playwright/test";
import { join } from "node:path";
import { processingJob, processingSource } from "./document-processing-fixture";

// Production UI components; simulate only API responses here. The persistence
// and API suites separately exercise authentication, transactions and PDFium.
export async function verifyDocumentProcessing(
  browser: Browser,
  origin: string,
  root: string,
) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    try {
      await page.clock.install();
      let job: ReturnType<typeof processingJob> | null = null;
      let failRead = false;
      let losePost = true;
      let posts = 0,
        deletes = 0,
        reads = 0;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith("/api/stores/")) return route.continue();
        expect(url.pathname).toBe(
          `/api/stores/${"a".repeat(24)}/attachments/documents/${processingSource.id}/processing`,
        );
        switch (route.request().method()) {
          case "GET":
            reads++;
            if (failRead)
              return route.fulfill({
                status: 404,
                json: { error: "private-error-not-for-display" },
              });
            break;
          case "POST":
            posts++;
            expect(route.request().postDataJSON()).toEqual({});
            job = {
              ...processingJob(),
              state: "queued",
              result: null,
              checkpoint: "queued",
              attempts: 0,
            };
            if (losePost) {
              losePost = false;
              return route.abort();
            }
            break;
          case "DELETE":
            deletes++;
            job = { ...processingJob(), state: "cancelled", result: null };
            break;
          default:
            throw new Error("Unexpected processing request");
        }
        return route.fulfill({ json: { job } });
      });
      const open = async (query = "") => {
        await page.goto(`${origin}/processing${query}`);
        await page
          .getByRole("button", { name: "Texte du PDF", exact: true })
          .click();
      };
      await page.goto(`${origin}/processing`);
      expect(reads).toBe(0); // Collapsed list has no per-document requests.
      await page
        .getByRole("button", { name: "Texte du PDF", exact: true })
        .click();
      await expect(
        page.getByText("Aucune extraction disponible", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Extraire le texte", exact: true })
        .click();
      await expect(
        page
          .getByRole("region", {
            name: `Texte de ${processingSource.originalFileName}`,
          })
          .getByRole("alert"),
      ).toContainText("Action non confirmée");
      expect(posts).toBe(1);
      await expect(
        page.getByRole("button", { name: "Extraire le texte", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Actualiser le statut" }).click();
      await expect(
        page.getByText("Extraction en attente", { exact: true }),
      ).toBeVisible();
      expect(posts).toBe(1); // Lost acknowledgement recovered by GET, not POST.
      job = { ...processingJob(), state: "running", result: null };
      await page.clock.runFor(30_100);
      await expect(
        page.getByText("Extraction en cours", { exact: true }),
      ).toBeVisible();
      job = processingJob();
      await page.clock.runFor(30_100);
      await expect(
        page.getByText("Texte extrait", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Texte de la page 1", { exact: true }),
      ).toContainText("<script>");
      expect(errors).toEqual([]); // Extracted HTML is rendered as literal text.
      await page.getByLabel("Page", { exact: true }).selectOption("1");
      await expect(
        page.getByText(/Aucun texte détecté sur cette page/),
      ).toBeVisible();
      await page.getByLabel("Page", { exact: true }).selectOption("0");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(root, ".local-backups", `document-processing-${width}.png`),
        fullPage: true,
      });
      // A fresh failed authorization read removes previously visible text.
      failRead = true;
      await page.getByRole("button", { name: "Actualiser le statut" }).click();
      await expect(
        page
          .getByRole("region", {
            name: `Texte de ${processingSource.originalFileName}`,
          })
          .getByRole("alert"),
      ).toContainText("Statut indisponible");
      await expect(
        page.getByLabel("Texte de la page 1", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText("private-error-not-for-display")).toHaveCount(
        0,
      );
      failRead = false;
      await page.getByRole("button", { name: "Actualiser le statut" }).click();
      await page
        .getByRole("button", { name: "Retirer le texte extrait" })
        .click();
      await expect(
        page.getByText("Extraction annulée", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Télécharger/ }),
      ).toBeVisible();
      expect(deletes).toBe(1);
      await expect(
        page.getByRole("button", { name: "Extraire le texte", exact: true }),
      ).toHaveCount(0);
      job = {
        ...processingJob(),
        state: "failed",
        result: null,
        error: "budget_exhausted",
      };
      await open();
      await expect(
        page.getByText(/nombre maximal de tentatives/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Extraire le texte", exact: true }),
      ).toHaveCount(0);
      // Disabled admission retains read/cancel; read-only users see no commands.
      job = processingJob();
      await open("?disabled=true");
      await expect(
        page.getByRole("button", { name: "Retirer le texte extrait" }),
      ).toBeVisible();
      await open("?readonly=true");
      await expect(
        page.getByText("Texte extrait", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Retirer le texte extrait" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(
        0,
      );
      job = null;
      await open("?disabled=true");
      await expect(
        page.getByText(/L’extraction n’est pas activée/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Extraire le texte", exact: true }),
      ).toHaveCount(0);
      // Closing drops content and stops automatic checks.
      job = { ...processingJob(), state: "queued", result: null };
      await open();
      await expect(
        page.getByText("Extraction en attente", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Masquer le texte du PDF" })
        .click();
      const before = reads;
      await page.clock.runFor(90_000);
      expect(reads).toBe(before);
      if (width === 390) {
        // Automatic status checks are bounded, not an endless polling loop.
        await open();
        await expect(
          page.getByText("Extraction en attente", { exact: true }),
        ).toBeVisible();
        const initialReads = reads;
        for (let check = 1; check <= 20; check++) {
          await page.clock.runFor(30_100);
          await expect.poll(() => reads).toBe(initialReads + check);
          await expect(
            page.getByRole("button", { name: "Actualiser le statut" }),
          ).toBeEnabled();
        }
        await expect(
          page.getByText(/Suivi automatique en pause/),
        ).toBeVisible();
        await page.clock.runFor(90_000);
        expect(reads).toBe(initialReads + 20);
        // Text already displayed disappears at expiry, even without navigation.
        job = {
          ...processingJob(),
          expiresAt: new Date(
            (await page.evaluate(() => Date.now())) + 5000,
          ).toISOString(),
        };
        await open();
        await expect(
          page.getByLabel("Texte de la page 1", { exact: true }),
        ).toBeVisible();
        await page.clock.runFor(6000);
        await expect(
          page.getByText("Aucune extraction disponible", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByLabel("Texte de la page 1", { exact: true }),
        ).toHaveCount(0);
      }
      expect(posts).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }
}

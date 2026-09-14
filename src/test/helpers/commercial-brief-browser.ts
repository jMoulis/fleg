import { expect, type Browser } from "@playwright/test";
import { join } from "node:path";
import {
  briefPolicy,
  briefStatusSchema,
  briefReviewSchema,
  type BriefStatus,
} from "@/domain/commercial-briefs/schemas";
import {
  briefTestConfig,
  briefTestExtraction,
  briefTestPages,
} from "./commercial-brief-fixture";
import { processingSource } from "./document-processing-fixture";

export async function verifyCommercialBrief(
  browser: Browser,
  origin: string,
  root: string,
) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    try {
      await page.clock.install();
      let brief: BriefStatus | null = null;
      let reads = 0,
        analyses = 0,
        reviews = 0;
      let lost = true,
        failRead = false,
        canReview = true;
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const job = () =>
        briefStatusSchema.parse({
          id: "c".repeat(64),
          sourceId: processingSource.id,
          state: "queued",
          revision: 0,
          model: briefTestConfig.model,
          policyVersion: briefPolicy.version,
          expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
          pages: briefTestPages,
          extraction: null,
          reviews: [],
          usage: null,
          error: null,
        });
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        expect(url.pathname).toBe(
          `/api/stores/${"a".repeat(24)}/attachments/documents/${processingSource.id}/brief`,
        );
        if (route.request().method() === "GET") {
          reads++;
          if (failRead)
            return route.fulfill({ status: 404, json: { message: "private" } });
        } else {
          const body = route.request().postDataJSON();
          if (body.action === "analyze") {
            expect(body).toEqual({
              action: "analyze",
              consent: true,
              pages: [1],
            });
            analyses++;
            brief = job();
            if (lost) {
              lost = false;
              return route.abort();
            }
          } else {
            expect(body.action).toBe("review");
            const review = briefReviewSchema.parse(body.review);
            expect(review.expectedRevision).toBe(brief!.revision);
            reviews++;
            brief = {
              ...brief!,
              state: "reviewed",
              revision: brief!.revision + 1,
              reviews: [
                {
                  section: review.section,
                  decision: review.decision,
                  values: review.values,
                  actorId: "synthetic-reviewer",
                  reviewedAt: new Date().toISOString(),
                },
              ],
            };
          }
        }
        return route.fulfill({
          json: {
            brief,
            available: true,
            canAnalyze: true,
            canReview,
            pages: [
              { page: 1, characters: 100 },
              { page: 2, characters: 0 },
            ],
            matches: [],
            estimate: {
              model: briefTestConfig.model,
              reservedUsdCents: 5,
              dailyBudgetUsdCents: 100,
            },
          },
        });
      });
      await page.goto(`${origin}/processing`);
      expect(reads).toBe(0);
      const toggle = page.getByRole("button", {
        name: "Brouillon commercial IA",
        exact: true,
      });
      await toggle.click();
      await expect(
        page.getByText("Aucun brouillon commercial", { exact: true }),
      ).toBeVisible();
      const analyze = page.getByRole("button", {
        name: "Préparer le brouillon commercial",
      });
      await expect(analyze).toBeDisabled();
      await expect(
        page.getByRole("checkbox", { name: /Page 2/ }),
      ).toBeDisabled();
      await page.getByRole("checkbox", { name: "Page 1", exact: true }).check();
      await expect(analyze).toBeDisabled();
      await page
        .getByRole("checkbox", { name: /J’autorise l’analyse/ })
        .check();
      await analyze.click();
      await expect(
        page
          .getByRole("region", { name: "Relecture du brouillon commercial" })
          .getByRole("alert"),
      ).toContainText("Action non confirmée");
      expect(analyses).toBe(1);
      await page
        .getByRole("button", { name: "Actualiser le brouillon" })
        .click();
      await expect(
        page.getByText("Demande enregistrée — analyse en attente", {
          exact: true,
        }),
      ).toBeVisible();
      brief = { ...brief!, state: "draft", extraction: briefTestExtraction() };
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      await expect(
        page.getByText("Brouillon à vérifier", { exact: true }),
      ).toBeVisible();
      const draftReads = reads;
      await page.clock.runFor(90_000);
      expect(reads).toBe(draftReads); // A 30-day expiry must not overflow into a polling loop.
      await page.getByLabel("Prix de vente (€)", { exact: true }).fill("2,50");
      await page.screenshot({
        path: join(
          root,
          ".local-backups",
          `commercial-brief-review-${width}.png`,
        ),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Confirmer la transcription" })
        .click();
      await expect(
        page.getByText("Transcription relue — aucune opération appliquée", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        brief!.reviews[0]!.values.find((f) => f.key === "selling_price_cents")!
          .value,
      ).toBe(250);
      expect(
        brief!.extraction!.sections[0]!.fields.find(
          (f) => f.key === "selling_price_cents",
        )!.value,
      ).toBe(260);
      expect(reviews).toBe(1);
      expect(analyses).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      failRead = true;
      await page
        .getByRole("button", { name: "Actualiser le brouillon" })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Relecture du brouillon commercial" })
          .getByRole("alert"),
      ).toContainText("Brouillon indisponible");
      await expect(
        page.getByLabel("Prix de vente (€)", { exact: true }),
      ).toHaveCount(0);
      failRead = false;
      canReview = false;
      brief = { ...job(), state: "draft", extraction: briefTestExtraction() };
      await page
        .getByRole("button", { name: "Actualiser le brouillon" })
        .click();
      await expect(
        page.getByLabel("Prix de vente (€)", { exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Confirmer la transcription" }),
      ).toHaveCount(0);
      canReview = true;
      await page
        .getByRole("button", { name: "Actualiser le brouillon" })
        .click();
      await page.getByRole("button", { name: "Exclure cet élément" }).click();
      await expect(
        page.getByText("Élément exclu", { exact: true }),
      ).toBeVisible();
      expect(brief!.reviews[0]!.values).toEqual([]);
      brief = job();
      await page
        .getByRole("button", { name: "Actualiser le brouillon" })
        .click();
      await expect(
        page.getByText("Demande enregistrée — analyse en attente", {
          exact: true,
        }),
      ).toBeVisible();
      await toggle.click();
      const closedReads = reads;
      await page.clock.runFor(90_000);
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      expect(reads).toBe(closedReads);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }
}

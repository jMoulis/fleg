import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { expect, test } from "@playwright/test";
import { requireE2eEnvironment } from "@/domain/testing/e2e-environment";
import { processingJob } from "@/test/helpers/document-processing-fixture";
import { getDemoStorePair } from "./demo-store";

test("TECH-05 consulte et retire un texte sans supprimer le PDF ni croiser les magasins", async ({
  page,
}, testInfo) => {
  const env = requireE2eEnvironment(process.env);
  const { primary, control } = await getDemoStorePair(page);
  const client = await MongoClient.connect(env.MONGODB_URI);
  const sourceId = new ObjectId();
  const db = client.db(env.MONGODB_APP_DB);
  const fileName = `Recette extraction ${testInfo.project.name}.pdf`;
  try {
    const user = await client
      .db(env.MONGODB_AUTH_DB)
      .collection("user")
      .findOne({ email: process.env.E2E_EMAIL });
    const store = await db
      .collection("stores")
      .findOne({ _id: new ObjectId(primary.id) });
    if (!store || !user) throw new Error("Missing isolated document scope");
    const job = processingJob();
    if (job.result)
      job.result.pages[0]!.text =
        "SEMAINE DU PRIMEUR\nTomates — origine France\nPrix conseillé : 2,49 € / kg\n\nTexte synthétique de recette, sans analyse IA.";
    const scope = {
      organizationId: String(store.organizationId),
      storeId: new ObjectId(primary.id),
    };
    // Synthetic persisted output only. No real Blob object, file upload or AI.
    await db.collection("documentSources").insertOne({
      _id: sourceId,
      ...scope,
      originalFileName: fileName,
      caption: "Recette locale — texte synthétique",
      checksumSha256: job.checksumSha256,
      sizeBytes: 1024,
      createdAt: new Date(),
      mimeType: "application/pdf",
      storageState: "linked",
      uploadIntentId: randomUUID(),
      storage: {
        backend: "vercel_blob",
        storeId: "store_test",
        namespace: "local-test",
        pathname: `fleg/local-test/${"a".repeat(64)}/${primary.id}/${randomUUID()}.pdf`,
      },
      verification: {
        pageCount: 2,
        parserVersion: "pdfium-2.1.13-fleg-2",
        verifiedAt: new Date(),
      },
    });
    await db
      .collection<
        { _id: string } & Record<string, unknown>
      >("documentProcessingJobs")
      .insertOne({
        _id: sourceId.toHexString().padEnd(64, "0"),
        ...scope,
        sourceId,
        ownerId: String(user._id),
        checksumSha256: job.checksumSha256,
        policyVersion: job.policyVersion,
        state: "ready",
        attempts: 1,
        checkpoint: "extracted",
        error: null,
        result: job.result,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(job.expiresAt),
        nextAttemptAt: new Date(),
        history: [],
      });
    const endpoint = `/api/stores/${primary.id}/attachments/documents/${sourceId}/processing`;
    const foreign = await page.request.get(
      `/api/stores/${control.id}/attachments/documents/${sourceId}/processing`,
    );
    expect(foreign.status()).toBe(404);
    await page.goto(`/reseau-fl-demo/stores/${primary.id}/documents`);
    const card = page.getByRole("listitem").filter({ hasText: fileName });
    await card
      .getByRole("button", { name: "Texte du PDF", exact: true })
      .click();
    await expect(
      card.getByText("Texte extrait", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByLabel("Texte de la page 1", { exact: true }),
    ).toContainText("Tomates");
    await card.getByLabel("Page", { exact: true }).selectOption("1");
    await expect(card.getByText(/Aucun texte détecté/)).toBeVisible();
    await card.getByLabel("Page", { exact: true }).selectOption("0");
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    if (testInfo.project.name === "mobile-390") {
      const expiry = await card
        .getByText(/Extraction temporaire jusqu’au/)
        .boundingBox();
      const navigation = await page
        .getByRole("navigation", { name: "Navigation principale", exact: true })
        .filter({ visible: true })
        .boundingBox();
      expect(expiry).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect(expiry!.y + expiry!.height).toBeLessThanOrEqual(navigation!.y);
    }
    await testInfo.attach("document-extraction", {
      body: await card.screenshot(),
      contentType: "image/png",
    });
    const screenshotPath = testInfo.outputPath("document-extraction.png");
    await card.screenshot({ path: screenshotPath });
    page.once("dialog", (dialog) => dialog.accept());
    await card
      .getByRole("button", { name: "Retirer le texte extrait" })
      .click();
    await expect(
      card.getByText("Extraction annulée", { exact: true }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: /Télécharger/ })).toBeVisible();
    const response = await page.request.get(endpoint);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      job: { state: "cancelled", result: null },
    });
    expect(
      await db
        .collection("documentSources")
        .countDocuments({ _id: sourceId, storageState: "linked" }),
    ).toBe(1);
    expect(
      await db
        .collection("documentProcessingJobs")
        .countDocuments({ sourceId, result: { $exists: true } }),
    ).toBe(0);
    await page.reload();
    await card
      .getByRole("button", { name: "Texte du PDF", exact: true })
      .click();
    await expect(
      card.getByText("Extraction annulée", { exact: true }),
    ).toBeVisible();
  } finally {
    // Exact generated source only, inside the guard-validated disposable DB.
    await db.collection("documentProcessingJobs").deleteMany({ sourceId });
    await db.collection("documentSources").deleteOne({ _id: sourceId });
    await client.close();
  }
});

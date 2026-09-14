import { processingStatusSchema } from "@/domain/attachments/document-processing";

export const processingSource = {
  id: "b".repeat(24),
  originalFileName: "Brief fruits et légumes — recette.pdf",
  caption: "Document synthétique de recette",
  sizeBytes: 1024,
  checksumSha256: "a".repeat(64),
  pageCount: 2,
  createdAt: "2026-09-14T08:00:00.000Z",
  contentUrl: `/api/stores/${"a".repeat(24)}/attachments/documents/${"b".repeat(24)}/content`,
};

export function processingJob() {
  return processingStatusSchema.parse({
    sourceId: processingSource.id,
    checksumSha256: processingSource.checksumSha256,
    policyVersion: "pdf-text-1",
    state: "ready",
    attempts: 1,
    checkpoint: "extracted",
    error: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    nextAttemptAt: new Date().toISOString(),
    result: {
      extractorVersion: "pdfium-2.1.13-text-1",
      pages: [
        {
          page: 1,
          text: "SEMAINE DU PRIMEUR\nTomates — origine France\nPrix conseillé : 2,49 € / kg\n\nTexte de recette, sans analyse IA.\n<script>alert('ne pas exécuter')</script>",
        },
        { page: 2, text: "" },
      ],
    },
    reviewState: "unreviewed",
    indexing: "not_requested",
    providerSpendCents: 0,
  });
}

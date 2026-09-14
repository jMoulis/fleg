import { z } from "zod";
import { processingStatusSchema } from "@/domain/attachments/document-processing";

export type DocumentProcessingStatus = z.infer<typeof processingStatusSchema>;

export const processingLabels: Record<
  DocumentProcessingStatus["state"],
  string
> = {
  queued: "Extraction en attente",
  running: "Extraction en cours",
  ready: "Texte extrait",
  failed: "Extraction interrompue",
  cancelled: "Extraction annulée",
};

export function processingDetail(job: DocumentProcessingStatus): string {
  if (job.state === "cancelled")
    return "Le texte a été retiré. Le PDF est conservé. Une nouvelle extraction sera possible après expiration et nettoyage de ce traitement.";
  if (job.state === "failed") {
    switch (job.error) {
      case "invalid_pdf":
        return "Le texte n’a pas pu être extrait : PDF incompatible ou limites dépassées.";
      case "budget_exhausted":
        return "Le nombre maximal de tentatives est atteint. Contactez un responsable ; ne renvoyez pas le PDF.";
      case "source_unavailable":
        return "Le document ou son accès n’est plus disponible.";
      default:
        return "Le traitement n’a pas abouti. Contactez un responsable ; ne renvoyez pas le PDF.";
    }
  }
  if (job.state === "queued" || job.state === "running")
    return job.error === "temporary"
      ? "Une reprise automatique est prévue. Vous pouvez quitter cette page."
      : "Le traitement peut prendre quelques minutes. Vous pouvez quitter cette page.";
  return "Texte brut, sans analyse IA ni validation commerciale. Vérifiez les tableaux dans le PDF original.";
}

// Same-origin API only. No private text/receipt is persisted in browser storage.
export async function requestDocumentProcessing(input: {
  storeId: string;
  sourceId: string;
  method: "GET" | "POST" | "DELETE";
  signal: AbortSignal;
}): Promise<DocumentProcessingStatus | null> {
  const response = await fetch(
    `/api/stores/${input.storeId}/attachments/documents/${input.sourceId}/processing`,
    {
      method: input.method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(15_000)]),
      ...(input.method === "GET"
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: "{}" }),
    },
  );
  if (!response.ok) throw new Error("Document processing unavailable");
  const { job } = z
    .object({ job: processingStatusSchema.nullable() })
    .parse(await response.json());
  if (job && job.sourceId !== input.sourceId)
    throw new Error("Unexpected document processing source");
  return job && Date.parse(job.expiresAt) > Date.now() ? job : null;
}

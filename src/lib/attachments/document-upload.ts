import * as z from "zod";
import {
  documentMaxSizeBytes,
  uploadIntentInputSchema,
  uploadIntentReceiptSchema,
  type UploadIntentReceipt,
} from "@/domain/attachments/private-storage";
import { signedUploadSchema } from "@/domain/attachments/upload-transport";
import { apiErrorSchema } from "@/domain/api/schemas";

const receiptResponse = z.object({ intent: uploadIntentReceiptSchema });
export async function attachmentCommand(path: string, body: unknown = {}) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload);
    throw new Error(
      error.success
        ? `${error.data.message} · référence ${error.data.requestId}`
        : "La demande n’a pas abouti. Réessayez.",
    );
  }
  return payload;
}

export async function verifyDocumentUpload(
  base: string,
  id: string,
): Promise<UploadIntentReceipt> {
  return receiptResponse.parse(
    await attachmentCommand(`${base}/${z.uuid().parse(id)}/verify`),
  ).intent;
}

export async function prepareDocument(
  file: File,
  caption: string,
  idempotencyKey: string,
) {
  if (
    !file.size ||
    file.size > documentMaxSizeBytes ||
    !/\.pdf$/i.test(file.name) ||
    (file.type && file.type !== "application/pdf")
  )
    throw new Error("Choisissez un PDF de 25 Mo maximum.");
  const bytes = await file.arrayBuffer();
  const checksumSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return uploadIntentInputSchema.parse({
    kind: "document",
    target: { type: "store" },
    idempotencyKey,
    originalFileName: file.name,
    caption: caption.trim() || null,
    checksumSha256,
    mimeType: "application/pdf",
    sizeBytes: file.size,
  });
}

export async function sendDocument(input: {
  base: string;
  file: File;
  caption: string;
  idempotencyKey: string;
  remember: (id: string) => void;
  phase: (text: string) => void;
}) {
  input.phase("Préparation du PDF…");
  const metadata = await prepareDocument(
    input.file,
    input.caption,
    input.idempotencyKey,
  );
  const intent = receiptResponse.parse(
    await attachmentCommand(input.base, metadata),
  ).intent;
  // Persist only an opaque recovery ID, before requesting a capability or PUT.
  // A storage failure must prevent the upload, not silently lose recovery.
  input.remember(intent.id);
  if (intent.state !== "reserved") return intent;
  const { upload } = z
    .object({ upload: signedUploadSchema })
    .parse(await attachmentCommand(`${input.base}/${intent.id}/authorization`));
  const url = new URL(upload.url);
  if (
    url.origin !== "https://vercel.com" ||
    !/^\/api\/blob\/?$/.test(url.pathname) ||
    url.username ||
    url.password ||
    upload.contentType !== metadata.mimeType ||
    Date.parse(upload.validUntil) <= Date.now()
  )
    throw new Error("Autorisation d’envoi invalide. Aucun fichier envoyé.");
  input.phase("Envoi du PDF…");
  try {
    const response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      // The SDK protocol uses x-content-type, not the HTTP File Content-Type.
      body: new Blob([input.file]),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    // A lost/negative acknowledgement is not proof of absence. Never retry PUT.
    await response.body?.cancel();
  } catch {
    /* The authorized server read below decides whether bytes arrived. */
  }
  input.phase("Vérification du PDF…");
  return verifyDocumentUpload(input.base, intent.id);
}

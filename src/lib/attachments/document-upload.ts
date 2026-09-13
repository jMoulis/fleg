import * as z from "zod";
import {
  documentMaxSizeBytes,
  uploadIntentInputSchema,
  uploadIntentReceiptSchema,
  type UploadIntentReceipt,
} from "@/domain/attachments/private-storage";
import { signedUploadSchema } from "@/domain/attachments/upload-transport";
import { apiErrorSchema } from "@/domain/api/schemas";
import { uploadLifecyclePolicy } from "@/domain/attachments/upload-lifecycle-policy";

const receiptResponse = z.object({ intent: uploadIntentReceiptSchema });

export function documentVerificationMessage(
  intent: UploadIntentReceipt,
  automatic = false,
) {
  const reason =
    intent.verificationIssue === "pdf_validator_unavailable"
      ? "PDF reçu — validation temporairement indisponible."
      : intent.receivedAt || intent.state === "uploaded"
        ? "PDF reçu — vérification en cours."
        : "Confirmation de réception en cours.";
  if (automatic)
    return `${reason} Reprise automatique, sans renvoyer le fichier.`;
  const retryAt = new Date(intent.reconcileAfter).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${reason} Vérification à reprendre à partir du ${retryAt}. Aucun nouvel envoi nécessaire.`;
}

export async function attachmentCommand(
  path: string,
  body: unknown = {},
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.any([
      AbortSignal.timeout(65_000),
      ...(signal ? [signal] : []),
    ]),
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
  signal?: AbortSignal,
): Promise<UploadIntentReceipt> {
  return receiptResponse.parse(
    await attachmentCommand(`${base}/${z.uuid().parse(id)}/verify`, {}, signal),
  ).intent;
}

function waitForVerification(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Only rechecks the same intent: no new reservation, token or PUT. Deadlines
// from the server are respected, including those persisted by older versions.
export async function recoverDocumentUpload(input: {
  base: string;
  id: string;
  initial?: UploadIntentReceipt;
  onProgress: (intent: UploadIntentReceipt) => void;
  signal: AbortSignal;
}) {
  let receipt = input.initial;
  const deadline = Date.now() + uploadLifecyclePolicy.browserRecoveryWindowMs;
  for (
    let attempt = 0;
    attempt < uploadLifecyclePolicy.automaticVerificationAttempts;
    attempt++
  ) {
    input.signal.throwIfAborted();
    if (receipt) {
      if (!["reserved", "uploaded", "verified"].includes(receipt.state))
        return receipt;
      input.onProgress(receipt);
      const delay = Math.max(
        500,
        Date.parse(receipt.reconcileAfter) - Date.now(),
      );
      if (Date.now() + delay >= deadline) return receipt;
      await waitForVerification(delay, input.signal);
    }
    receipt = await verifyDocumentUpload(input.base, input.id, input.signal);
  }
  return receipt!;
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

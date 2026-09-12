import "server-only";
import { uploadIntentMaxBodyBytes } from "@/domain/attachments/private-storage";
import { PhotoValidationError } from "@/domain/attachments/photo-validation";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

export async function readUploadIntentRequest(
  request: Request,
): Promise<unknown> {
  // Do not trust forwarded host headers or an arbitrary CORS caller. The URL
  // origin is the Next request origin, including the actual preview hostname.
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new StoreAccessDeniedError();
  return readBoundedUploadJson(request, uploadIntentMaxBodyBytes);
}

// Provider callbacks have a distinct signature boundary, not browser Origin.
export async function readBoundedUploadJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new PhotoValidationError("Un envoi JSON est requis");
  const reader = request.body?.getReader();
  if (!reader) throw new PhotoValidationError("Envoi vide");
  let total = 0;
  let text = "";
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes)
        throw new PhotoValidationError("Métadonnées trop volumineuses");
      text += decoder.decode(value, { stream: true });
    }
    if (expired)
      throw new PhotoValidationError(
        "Délai de réception des métadonnées dépassé",
      );
    text += decoder.decode();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new PhotoValidationError("Métadonnées JSON invalides");
    }
  } catch (error) {
    if (error instanceof PhotoValidationError) throw error;
    throw new PhotoValidationError("Métadonnées JSON invalides");
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { get } from "@vercel/blob";
import {
  privateBlobReferenceSchema,
  PrivateStorageError,
  type PrivateBlobReference,
} from "@/domain/attachments/private-storage";
import { validatePhotoBytes } from "@/domain/attachments/photo-validation";
import {
  attachmentSchema,
  type Attachment,
} from "@/domain/attachments/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import type { PrivateStorageConfig } from "@/server/storage/config";

export function scopedObjectPrefix(
  context: AuthorizedStoreContext,
  namespace: string,
): string {
  const organizationHash = createHash("sha256")
    .update(context.organizationId)
    .digest("hex");
  return `fleg/${namespace}/${organizationHash}/${context.storeId.toLowerCase()}/`;
}

export interface PrivateObjectReader {
  readPhoto(
    context: AuthorizedStoreContext,
    reference: PrivateBlobReference,
    attachment: Attachment,
  ): Promise<Uint8Array>;
}

export class VercelPrivateObjectReader implements PrivateObjectReader {
  constructor(private readonly config: PrivateStorageConfig) {}

  async readPhoto(
    context: AuthorizedStoreContext,
    rawReference: PrivateBlobReference,
    rawAttachment: Attachment,
  ): Promise<Uint8Array> {
    if (!context.permissions.includes("stores.read"))
      throw new StoreAccessDeniedError();
    const attachment = attachmentSchema.parse(rawAttachment);
    const reference = privateBlobReferenceSchema.parse(rawReference);
    if (
      reference.storeId !== this.config.storeId ||
      reference.namespace !== this.config.namespace ||
      !reference.pathname.startsWith(
        scopedObjectPrefix(context, this.config.namespace),
      ) ||
      attachment.storeId !== context.storeId ||
      attachment.organizationId !== context.organizationId
    ) {
      throw new PrivateStorageError(
        "STORAGE_INTEGRITY",
        "Référence de stockage invalide",
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.readTimeoutMs,
    );
    try {
      const response = await get(reference.pathname, {
        access: "private",
        token: this.config.token,
        useCache: false,
        abortSignal: controller.signal,
      });
      if (!response || response.statusCode !== 200)
        throw new PrivateStorageError(
          "STORAGE_UNAVAILABLE",
          "Photo distante temporairement indisponible",
        );
      const reader = response.stream.getReader();
      try {
        if (
          response.blob.size !== attachment.sizeBytes ||
          response.blob.contentType !== attachment.mimeType ||
          response.blob.pathname !== reference.pathname
        ) {
          throw new PrivateStorageError(
            "STORAGE_INTEGRITY",
            "Les métadonnées de la photo distante ne correspondent pas",
          );
        }
        // Allocate only the validated photo size (at most 4 MiB), never an
        // unbounded provider response; check content before sending any bytes.
        const bytes = new Uint8Array(attachment.sizeBytes);
        let offset = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.byteLength > bytes.byteLength)
            throw new PrivateStorageError(
              "STORAGE_INTEGRITY",
              "Photo distante trop volumineuse",
            );
          bytes.set(value, offset);
          offset += value.byteLength;
        }
        if (
          offset !== attachment.sizeBytes ||
          createHash("sha256").update(bytes).digest("hex") !==
            attachment.checksumSha256
        ) {
          throw new PrivateStorageError(
            "STORAGE_INTEGRITY",
            "L’intégrité de la photo distante n’a pas pu être vérifiée",
          );
        }
        validatePhotoBytes({
          bytes,
          declaredMimeType: attachment.mimeType,
          declaredSizeBytes: attachment.sizeBytes,
        });
        return bytes;
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof PrivateStorageError) throw error;
      throw new PrivateStorageError(
        "STORAGE_UNAVAILABLE",
        "Photo distante temporairement indisponible",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

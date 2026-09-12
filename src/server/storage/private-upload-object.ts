import "server-only";
import { createHash } from "node:crypto";
import { get, del } from "@vercel/blob";
import {
  privateBlobReferenceSchema,
  uploadIntentInputSchema,
  PrivateStorageError,
  type PrivateBlobReference,
  type UploadIntentInput,
} from "@/domain/attachments/private-storage";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { PrivateStorageConfig } from "./config";
import { scopedObjectPrefix } from "./private-object-reader";

export interface PrivateUploadObjectStore {
  read(
    context: AuthorizedStoreContext,
    reference: PrivateBlobReference,
    input: UploadIntentInput,
  ): Promise<Uint8Array | null>;
  remove(
    context: AuthorizedStoreContext,
    reference: PrivateBlobReference,
  ): Promise<void>;
}

export class VercelPrivateUploadObjectStore
  implements PrivateUploadObjectStore
{
  constructor(private readonly config: PrivateStorageConfig) {}

  private reference(
    context: AuthorizedStoreContext,
    raw: PrivateBlobReference,
  ) {
    const reference = privateBlobReferenceSchema.parse(raw);
    if (
      !context.permissions.includes("stores.read") &&
      !context.permissions.includes("attachments.write")
    )
      throw new StoreAccessDeniedError();
    if (
      reference.storeId !== this.config.storeId ||
      reference.namespace !== this.config.namespace ||
      !reference.pathname.startsWith(
        scopedObjectPrefix(context, this.config.namespace),
      )
    )
      throw new PrivateStorageError(
        "STORAGE_INTEGRITY",
        "Référence de stockage invalide",
      );
    return reference;
  }

  async read(
    context: AuthorizedStoreContext,
    raw: PrivateBlobReference,
    rawInput: UploadIntentInput,
  ) {
    const reference = this.reference(context, raw);
    const input = uploadIntentInputSchema.parse(rawInput);
    const signal = AbortSignal.timeout(this.config.readTimeoutMs);
    try {
      const response = await get(reference.pathname, {
        access: "private",
        token: this.config.token,
        useCache: false,
        abortSignal: signal,
      });
      if (response === null) return null;
      if (response.statusCode !== 200)
        throw new PrivateStorageError(
          "STORAGE_UNAVAILABLE",
          "Lecture privée indisponible",
        );
      const reader = response.stream.getReader();
      try {
        if (
          response.blob.pathname !== reference.pathname ||
          response.blob.size !== input.sizeBytes ||
          response.blob.contentType !== input.mimeType
        )
          throw new PrivateStorageError(
            "STORAGE_INTEGRITY",
            "Le fichier reçu ne correspond pas à l’intention",
          );
        const bytes = new Uint8Array(input.sizeBytes);
        let offset = 0;
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.byteLength > bytes.byteLength)
            throw new PrivateStorageError(
              "STORAGE_INTEGRITY",
              "Fichier reçu trop volumineux",
            );
          bytes.set(value, offset);
          offset += value.byteLength;
        }
        if (
          offset !== bytes.length ||
          createHash("sha256").update(bytes).digest("hex") !==
            input.checksumSha256
        )
          throw new PrivateStorageError(
            "STORAGE_INTEGRITY",
            "Intégrité du fichier reçu non vérifiée",
          );
        return bytes;
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof PrivateStorageError) throw error;
      throw new PrivateStorageError(
        "STORAGE_UNAVAILABLE",
        "Lecture privée temporairement indisponible",
      );
    }
  }

  async remove(context: AuthorizedStoreContext, raw: PrivateBlobReference) {
    if (!context.permissions.includes("attachments.write"))
      throw new StoreAccessDeniedError();
    const reference = this.reference(context, raw);
    const signal = AbortSignal.timeout(this.config.readTimeoutMs);
    try {
      await del(reference.pathname, {
        token: this.config.token,
        abortSignal: signal,
      });
      const response = await get(reference.pathname, {
        access: "private",
        token: this.config.token,
        useCache: false,
        abortSignal: signal,
      });
      if (response !== null) {
        if (response.statusCode === 200)
          void response.stream.cancel().catch(() => undefined);
        throw new Error("Object still present");
      }
    } catch {
      // A timeout, 5xx, or a successful DELETE without fresh absence is not proof.
      throw new PrivateStorageError(
        "STORAGE_UNAVAILABLE",
        "Suppression à reprendre",
      );
    }
  }
}

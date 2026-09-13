import { z } from "zod";
import {
  offlineIdentitySchema,
  sameOfflineIdentity,
} from "@/domain/offline/schemas";
import { uploadIntentReceiptSchema } from "@/domain/attachments/private-storage";
import {
  photoQueuePolicy,
  type PreparedPhotos,
} from "@/domain/attachments/photo-queue";
import {
  assertPhotoPreparation,
  claimPhoto,
  updateClaim,
} from "./photo-queue-storage";
import {
  attachmentCommand,
  sendPhoto,
  verifyDocumentUpload,
} from "./private-upload";

export async function checkPhotoAccess(
  preparation: PreparedPhotos,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/stores/${preparation.identity.storeId}/attachments/offline`,
    {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    },
  );
  if ([401, 403, 404].includes(response.status)) return false;
  if (!response.ok)
    throw new Error("Vérification des accès indisponible. Photos conservées.");
  const access = offlineIdentitySchema
    .extend({ uploadsAvailable: z.boolean() })
    .parse(await response.json());
  if (!sameOfflineIdentity(access, preparation.identity)) return false;
  return access.uploadsAvailable ? "ready" : "disabled";
}

export async function syncLocalPhoto(input: {
  preparation: PreparedPhotos;
  id: string;
  signal: AbortSignal;
  manual?: boolean;
  discard?: boolean;
}) {
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(photoQueuePolicy.operationTimeoutMs),
  ]);
  const preparation = input.preparation;
  // No reservation or byte transfer before live session/store reauthorization.
  const access = await checkPhotoAccess(preparation, signal);
  if (!access)
    throw new Error(
      "Session ou accès modifié. Reconnectez-vous puis préparez la cible ; photos conservées.",
    );
  if (access === "disabled" && !input.discard)
    throw new Error("Envoi indisponible. Photos conservées sur cet appareil.");
  const claim = await claimPhoto(
    preparation,
    input.id,
    input.manual || input.discard,
  );
  if (!claim) return;
  const base = `/api/stores/${preparation.identity.storeId}/attachments/upload-intents`;
  const beforeRequest = async () => {
    signal.throwIfAborted();
    await assertPhotoPreparation(preparation);
    // Also fence an expired/replaced cross-tab lease before any transport work.
    await updateClaim(preparation, claim.value, (current) => current);
  };
  let expectedIntentId = claim.value.intentId;
  const remember = async (id: string) => {
    await updateClaim(preparation, claim.value, (v) => ({
      ...v,
      intentId: id,
    }));
    expectedIntentId = id;
  };
  try {
    if (input.discard && claim.firstSend) {
      // A never-started row is the only case requiring no remote cancellation.
      await updateClaim(preparation, claim.value, () => null);
      return;
    }
    let receipt;
    if (claim.firstSend && !input.discard) {
      const file = new File(
        [claim.bytes],
        claim.value.metadata.originalFileName,
        { type: claim.value.metadata.mimeType },
      );
      receipt = await sendPhoto({
        base,
        file,
        caption: claim.value.metadata.caption ?? "",
        target: claim.value.metadata.target,
        idempotencyKey: claim.value.metadata.idempotencyKey,
        signal,
        remember,
        phase: () => undefined,
        owner: preparation.identity,
        beforeRequest,
      });
    } else {
      let id = claim.value.intentId;
      if (!id) {
        // Reservation ACK may have been lost. Replay frozen metadata/key, but
        // never issue a new grant/PUT here, even when receipt says "reserved".
        await beforeRequest();
        const result = z
          .object({ intent: uploadIntentReceiptSchema })
          .parse(
            await attachmentCommand(
              base,
              claim.value.metadata,
              signal,
              preparation.identity,
            ),
          );
        id = result.intent.id;
        await remember(id);
      }
      await beforeRequest();
      receipt = await verifyDocumentUpload(
        base,
        id,
        signal,
        preparation.identity,
      );
    }
    if (receipt.id !== expectedIntentId)
      throw new Error("Reçu hors périmètre. Photo locale conservée.");
    if (
      input.discard &&
      receipt.state !== "linked" &&
      !["cancelled", "deleted", "deleting", "rejected"].includes(receipt.state)
    ) {
      await beforeRequest();
      receipt = z
        .object({ intent: uploadIntentReceiptSchema })
        .parse(
          await attachmentCommand(
            `${base}/${receipt.id}/cancel`,
            {},
            signal,
            preparation.identity,
          ),
        ).intent;
      if (receipt.id !== expectedIntentId)
        throw new Error("Reçu hors périmètre. Photo locale conservée.");
    }
    const terminal = ["cancelled", "deleted", "deleting", "rejected"].includes(
      receipt.state,
    );
    if (receipt.state === "linked" || (input.discard && terminal)) {
      // Local deletion only after a verified durable link or explicit abandonment.
      await updateClaim(preparation, claim.value, () => null);
      return receipt;
    }
    await updateClaim(preparation, claim.value, (v) => ({
      ...v,
      receipt,
      lease: null,
      phase:
        terminal || v.attempts >= photoQueuePolicy.maxAttempts
          ? "attention"
          : "checking",
      nextAttemptAt: Math.max(
        Date.now() + photoQueuePolicy.retryMs,
        Date.parse(receipt.reconcileAfter),
      ),
      message: terminal
        ? "Envoi refusé ou abandonné. La copie locale reste conservée."
        : "Réception à vérifier · aucun nouvel envoi du fichier",
    }));
    return receipt;
  } catch (error) {
    // Never expose provider errors/URLs or delete the local original on failure.
    await updateClaim(preparation, claim.value, (v) => ({
      ...v,
      lease: null,
      phase:
        v.attempts >= photoQueuePolicy.maxAttempts ? "attention" : "checking",
      nextAttemptAt: Date.now() + photoQueuePolicy.retryMs,
      message:
        "Connexion ou vérification interrompue. Photo conservée ; reprise sans renvoi du fichier.",
    })).catch(() => undefined);
    throw error;
  }
}

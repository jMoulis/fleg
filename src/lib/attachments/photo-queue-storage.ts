import { offlineDb as db } from "@/lib/offline/storage";
import { preparationEpoch } from "@/lib/offline/database";
import { sameOfflineIdentity } from "@/domain/offline/schemas";
import {
  attachmentTargetKey,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import {
  localPhotoSchema,
  photoOwnerKey,
  photoQueuePolicy,
  preparedPhotosSchema,
  type LocalPhoto,
  type PreparedPhotos,
} from "@/domain/attachments/photo-queue";
import { preparePhoto } from "./private-upload";

function parsePhotoRow(row: { id: string; owner: string; value: unknown }) {
  const value = localPhotoSchema.parse(row.value);
  if (value.id !== row.id || photoOwnerKey(value.owner) !== row.owner)
    throw new Error("File locale incohérente. Aucune photo effacée.");
  return value;
}

export async function readPhotoPreparation() {
  const row = await db.copies.get("photos");
  return row ? preparedPhotosSchema.parse(row.value) : null;
}

export async function savePhotoPreparation(value: unknown, epoch: number) {
  const preparation = preparedPhotosSchema.parse(value);
  await db.transaction("rw", db.copies, db.meta, async () => {
    if (epoch !== (await preparationEpoch()))
      throw new Error("Session modifiée. Reconnectez-vous.");
    const previous = await readPhotoPreparation();
    const targets = new Map(
      preparation.targets.map((v) => [attachmentTargetKey(v.target), v]),
    );
    if (
      previous &&
      sameOfflineIdentity(previous.identity, preparation.identity) &&
      Date.parse(previous.expiresAt) > Date.now()
    ) {
      for (const item of previous.targets)
        if (!targets.has(attachmentTargetKey(item.target)))
          targets.set(attachmentTargetKey(item.target), item);
      // Refreshing one target never extends the validity of other prepared targets.
      preparation.expiresAt = new Date(
        Math.min(
          Date.parse(previous.expiresAt),
          Date.parse(preparation.expiresAt),
        ),
      ).toISOString();
    }
    await db.copies.put({
      key: "photos",
      value: preparedPhotosSchema.parse({
        ...preparation,
        targets: [...targets.values()],
      }),
    });
  });
}

export async function assertPhotoPreparation(expected: PreparedPhotos) {
  const current = await readPhotoPreparation();
  const now = Date.now();
  if (
    !current ||
    !sameOfflineIdentity(expected.identity, current.identity) ||
    now < Date.parse(current.preparedAt) ||
    now >= Date.parse(current.expiresAt)
  )
    throw new Error(
      "Préparation expirée ou session modifiée. Vos photos restent conservées ; reconnectez-vous puis préparez cette cible.",
    );
  return current;
}

export async function listLocalPhotos(preparation: PreparedPhotos) {
  return db.transaction("r", db.copies, db.photos, async () => {
    await assertPhotoPreparation(preparation);
    const owner = photoOwnerKey(preparation.identity);
    return (await db.photos.where("owner").equals(owner).toArray()).map(
      (row) => {
        const value = parsePhotoRow(row);
        if (photoOwnerKey(value.owner) !== owner || value.id !== row.id)
          throw new Error("File locale incohérente.");
        return value;
      },
    );
  });
}

export async function enqueuePhoto(input: {
  preparation: PreparedPhotos;
  file: File;
  target: AttachmentTarget;
  caption: string;
}) {
  // Hash/signature work outside the transaction; recheck the preparation inside it.
  const id = crypto.randomUUID();
  const metadata = await preparePhoto(
    input.file,
    input.target,
    input.caption,
    id,
  );
  return db.transaction("rw", db.copies, db.photos, async () => {
    const current = await assertPhotoPreparation(input.preparation);
    const target = current.targets.find(
      (v) =>
        attachmentTargetKey(v.target) === attachmentTargetKey(input.target),
    );
    if (!target)
      throw new Error(
        "Préparez cette cible avec du réseau avant de l’utiliser hors connexion.",
      );
    // Count ALL owners without exposing their identifiers/counts in the UI.
    const rows = await db.photos.toArray();
    const used = rows.reduce((total, row) => {
      if (!(row.bytes instanceof Blob))
        throw new Error("File locale incompatible. Aucune photo effacée.");
      return total + row.bytes.size;
    }, 0);
    if (
      rows.length >= photoQueuePolicy.maxPhotos ||
      used + input.file.size > photoQueuePolicy.maxBytes
    )
      throw new Error(
        "Limite locale atteinte sur cet appareil (10 photos / 40 Mio). Envoyez ou retirez vos photos en attente ; aucune donnée n’a été effacée.",
      );
    const value = localPhotoSchema.parse({
      schemaVersion: 1,
      id,
      owner: {
        userId: current.identity.userId,
        organizationId: current.identity.organizationId,
        storeId: current.identity.storeId,
      },
      label: target.label,
      metadata,
      createdAt: new Date().toISOString(),
      phase: "queued",
      intentId: null,
      receipt: null,
      attempts: 0,
      nextAttemptAt: 0,
      lease: null,
      message: "Enregistrée sur cet appareil · en attente d’envoi",
    });
    await db.photos.add({
      id,
      owner: photoOwnerKey(value.owner),
      value,
      bytes: new Blob([input.file], { type: metadata.mimeType }),
    });
    return value;
  });
}

// Transactions serialize claims across tabs. Expired work is verification-only:
// no second PUT can be issued even if a prior tab was suspended mid-upload.
export async function claimPhoto(
  preparation: PreparedPhotos,
  id: string,
  manual = false,
) {
  return db.transaction("rw", db.copies, db.photos, async () => {
    await assertPhotoPreparation(preparation);
    const row = await db.photos.get(id);
    if (!row || row.owner !== photoOwnerKey(preparation.identity))
      throw new Error("Photo locale introuvable.");
    const value = parsePhotoRow(row);
    const now = Date.now();
    if (value.lease && value.lease.until > now) return null;
    if (
      !manual &&
      (value.phase === "attention" ||
        value.attempts >= photoQueuePolicy.maxAttempts ||
        value.nextAttemptAt > now)
    )
      return null;
    const claimed = localPhotoSchema.parse({
      ...value,
      phase: "checking",
      attempts: manual ? 1 : value.attempts + 1,
      message:
        value.phase === "queued"
          ? "Envoi en cours · copie locale conservée"
          : "Vérification en cours · aucun nouvel envoi",
      lease: { id: crypto.randomUUID(), until: now + photoQueuePolicy.leaseMs },
    });
    await db.photos.put({ ...row, value: claimed });
    return {
      value: claimed,
      bytes: row.bytes,
      firstSend: value.phase === "queued",
    };
  });
}

export async function updateClaim(
  preparation: PreparedPhotos,
  claim: LocalPhoto,
  update: (value: LocalPhoto) => LocalPhoto | null,
) {
  return db.transaction("rw", db.copies, db.photos, async () => {
    await assertPhotoPreparation(preparation);
    const row = await db.photos.get(claim.id);
    if (!row || row.owner !== photoOwnerKey(preparation.identity))
      throw new Error("Photo locale introuvable.");
    const value = parsePhotoRow(row);
    if (!claim.lease || value.lease?.id !== claim.lease.id)
      throw new Error("Envoi repris dans un autre onglet.");
    const next = update(value);
    if (next)
      await db.photos.put({ ...row, value: localPhotoSchema.parse(next) });
    else await db.photos.delete(claim.id);
  });
}

export async function exportLocalPhoto(
  preparation: PreparedPhotos,
  id: string,
) {
  return db.transaction("r", db.copies, db.photos, async () => {
    await assertPhotoPreparation(preparation);
    const row = await db.photos.get(id);
    if (!row || row.owner !== photoOwnerKey(preparation.identity))
      throw new Error("Photo locale introuvable.");
    const value = parsePhotoRow(row);
    return { fileName: value.metadata.originalFileName, bytes: row.bytes };
  });
}

export async function discardUnsentPhoto(
  preparation: PreparedPhotos,
  id: string,
) {
  return db.transaction("rw", db.copies, db.photos, async () => {
    await assertPhotoPreparation(preparation);
    const row = await db.photos.get(id);
    if (!row || row.owner !== photoOwnerKey(preparation.identity))
      throw new Error("Photo locale introuvable.");
    const value = parsePhotoRow(row);
    if (value.phase !== "queued" || value.lease || value.intentId)
      throw new Error(
        "Un envoi a commencé. Reconnectez-vous pour confirmer son abandon.",
      );
    await db.photos.delete(id);
  });
}

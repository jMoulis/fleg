import { z } from "zod";
import { attachmentIdSchema } from "./schemas";
import { checksumSchema } from "./private-storage";

export const migrationInventoryLimits = {
  defaultPageSize: 25,
  maxPageSize: 100,
  defaultReadBytes: 16 * 1024 * 1024,
  maxReadBytes: 64 * 1024 * 1024,
  maxSnapshotBytes: 1024 * 1024,
} as const;

export const migrationScopeSchema = z
  .object({
    organizationId: z.string().min(1).max(128),
    storeId: attachmentIdSchema.transform((id) => id.toLowerCase()),
  })
  .strict();

export const migrationEntrySchema = z
  .object({
    ...migrationScopeSchema.shape,
    attachmentId: attachmentIdSchema,
    status: z.enum([
      "eligible_for_copy",
      "already_blob",
      "blob_with_bson",
      "orphan_bson",
      "missing_bson",
      "invalid_metadata",
      "invalid_content",
      "invalid_target",
      "changed_during_read",
      "deleting",
    ]),
    bsonBytes: z
      .number()
      .int()
      .nonnegative()
      .max(16 * 1024 * 1024)
      .nullable(),
    checksumSha256: checksumSchema.nullable(),
    metadataFingerprint: checksumSchema.nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.status !== "eligible_for_copy" ||
      (v.bsonBytes !== null &&
        v.bsonBytes > 0 &&
        v.bsonBytes <= 4 * 1024 * 1024 &&
        v.checksumSha256 !== null &&
        v.metadataFingerprint !== null),
  );

export const migrationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal("read-only-inventory"),
    databases: z
      .object({
        app: z.string().min(1).max(63),
        auth: z.string().min(1).max(63),
      })
      .strict(),
    scope: migrationScopeSchema,
    capturedAt: z.iso.datetime(),
    after: attachmentIdSchema.nullable(),
    nextCursor: attachmentIdSchema.nullable(),
    exhausted: z.boolean(),
    bytesRead: z
      .number()
      .int()
      .nonnegative()
      .max(migrationInventoryLimits.maxReadBytes),
    entries: z
      .array(migrationEntrySchema)
      .max(migrationInventoryLimits.maxPageSize),
  })
  .strict()
  .superRefine((value, ctx) => {
    let previous = value.after?.toLowerCase() ?? "";
    for (const entry of value.entries) {
      if (
        entry.organizationId !== value.scope.organizationId ||
        entry.storeId !== value.scope.storeId ||
        entry.attachmentId.toLowerCase() <= previous
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Périmètre ou ordre d’inventaire invalide",
        });
      }
      previous = entry.attachmentId.toLowerCase();
    }
    if (
      (value.exhausted && value.nextCursor !== null) ||
      (!value.exhausted &&
        (value.entries.length === 0 ||
          value.nextCursor?.toLowerCase() !== previous))
    )
      ctx.addIssue({ code: "custom", message: "Curseur incohérent" });
  });
export type MigrationSnapshot = z.infer<typeof migrationSnapshotSchema>;
export type MigrationEntry = z.infer<typeof migrationEntrySchema>;

// A report is evidence for review, NEVER authority to execute database writes.
export function planPhotoMigration(raw: unknown) {
  const snapshot = migrationSnapshotSchema.parse(raw);
  const candidates = snapshot.entries.filter(
    (v) => v.status === "eligible_for_copy",
  );
  return {
    mode: "dry-run" as const,
    databases: snapshot.databases,
    scope: snapshot.scope,
    capturedAt: snapshot.capturedAt,
    coverage:
      snapshot.after === null && snapshot.exhausted
        ? "complete_at_read_time"
        : "partial_page",
    nextCursor: snapshot.nextCursor,
    inspected: snapshot.entries.length,
    candidates: candidates.map(
      ({ attachmentId, checksumSha256, metadataFingerprint }) => ({
        attachmentId,
        checksumSha256,
        metadataFingerprint,
      }),
    ),
    eligibleLogicalBytes: candidates.reduce((sum, v) => sum + v.bsonBytes!, 0),
    bytesFreed: 0,
    needsReview: snapshot.entries.filter(
      (v) => !["eligible_for_copy", "already_blob"].includes(v.status),
    ),
    proposedSteps: [
      "Obtenir une autorisation séparée sur le périmètre, la destination Blob et le budget.",
      "Revalider droits, cible et empreinte ; réserver quota et journal durable avant toute copie.",
      "Copier l’original vers un chemin privé unique sans écrasement ; relire et vérifier taille, MIME et SHA-256.",
      "Basculer la référence par comparaison atomique en conservant le même identifiant et les métadonnées métier ; une suppression concurrente gagne.",
      "Rattacher la source au cycle durable de lecture/suppression, quotas et audit avant de considérer la bascule terminée.",
      "Après contrôle et autorisation de purge, supprimer uniquement le BSON exact ; jamais de suppression de collection ou de bucket.",
    ],
    rollback: {
      beforeSwitch:
        "Conserver BSON ; rapprocher uniquement la copie Blob précisément journalisée.",
      beforeBsonPurge:
        "Retour conditionnel vers BSON seulement si la source est encore active et les octets vérifiés ; journaliser et rapprocher Blob.",
      afterBsonPurge:
        "Pas de restauration BSON automatique : garder le lecteur Blob compatible et utiliser une restauration séparément autorisée si nécessaire.",
      concurrentDeletion:
        "Ne jamais recréer une photo supprimée. Terminer le nettoyage via le journal durable.",
    },
    warning:
      "Simulation sans copie, bascule, purge ou accès Blob. Inventaire non transactionnel à revalider ; ce rapport n’est ni une sauvegarde ni une autorisation.",
  };
}

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  migrationInventoryLimits,
  migrationScopeSchema,
  planPhotoMigration,
} from "@/domain/attachments/migration-plan";

let phase = "arguments";
async function emit(value: unknown, path?: string) {
  const json = JSON.stringify(value, null, 2);
  if (!path) {
    console.log(json);
    return;
  }
  // Never overwrite a previous inventory, follow an existing symlink or expose
  // operator reports with default world-readable file permissions.
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(json);
    await file.sync();
  } finally {
    await file.close();
  }
  console.log(
    "Rapport local créé. Aucune copie, bascule ou suppression exécutée.",
  );
}

async function main() {
  const { values } = parseArgs({
    strict: true,
    allowPositionals: false,
    options: {
      read: { type: "boolean", default: false },
      snapshot: { type: "string" },
      output: { type: "string" },
      "credentials-file": { type: "string" },
      organization: { type: "string" },
      store: { type: "string" },
      actor: { type: "string" },
      "confirm-scope": { type: "string" },
      "confirm-host": { type: "string" },
      "app-db": { type: "string" },
      "auth-db": { type: "string" },
      after: { type: "string" },
      "page-size": { type: "string" },
      "max-read-bytes": { type: "string" },
    },
  });
  if (!values.read) {
    if (
      values["credentials-file"] ||
      values.organization ||
      values.store ||
      values.actor ||
      values["confirm-scope"] ||
      values["confirm-host"] ||
      values["app-db"] ||
      values["auth-db"] ||
      values.after ||
      values["page-size"] ||
      values["max-read-bytes"]
    )
      throw new Error("Live arguments require explicit read mode");
    // Default and snapshot simulation NEVER load .env.local, MongoDB or Blob.
    if (!values.snapshot) {
      if (values.output) throw new Error("Snapshot required");
      console.log(
        JSON.stringify(
          {
            mode: "help",
            readOnly: true,
            limits: migrationInventoryLimits,
            usage:
              "--snapshot rapport.json [--output plan.json] ; inventaire autorisé : --read --organization ID --store ID --actor ID --app-db NOM --auth-db NOM --confirm-host HOTE --confirm-scope ORGANISATION/MAGASIN [--credentials-file fichier] [--output rapport.json]",
            note: "Aucun mode execute, aucun accès Blob. La variable PHOTO_MIGRATION_MONGODB_URI doit être fournie explicitement pour --read.",
          },
          null,
          2,
        ),
      );
      return;
    }
    phase = "snapshot";
    const file = await open(
      values.snapshot,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let raw: unknown;
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size > migrationInventoryLimits.maxSnapshotBytes
      )
        throw new Error("Snapshot too large");
      const bytes = Buffer.alloc(migrationInventoryLimits.maxSnapshotBytes + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          null,
        );
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > migrationInventoryLimits.maxSnapshotBytes)
        throw new Error("Snapshot too large");
      raw = JSON.parse(bytes.subarray(0, offset).toString("utf8"));
    } finally {
      await file.close();
    }
    await emit(planPhotoMigration(raw), values.output);
    return;
  }
  if (values.snapshot) throw new Error("Incompatible modes");
  const scope = migrationScopeSchema.parse({
    organizationId: values.organization,
    storeId: values.store,
  });
  const actor = z.string().min(1).max(128).parse(values.actor);
  const databaseName = z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,63}$/)
    .refine((s) => !["admin", "local", "config"].includes(s));
  const appName = databaseName.parse(values["app-db"]);
  const authName = databaseName.parse(values["auth-db"]);
  const host = z.string().min(1).max(255).parse(values["confirm-host"]);
  if (
    appName === authName ||
    values["confirm-scope"] !== `${scope.organizationId}/${scope.storeId}`
  )
    throw new Error("Explicit target confirmation required");
  const after = z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional()
    .parse(values.after);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(migrationInventoryLimits.maxPageSize)
    .parse(values["page-size"] ?? migrationInventoryLimits.defaultPageSize);
  const maxReadBytes = z.coerce
    .number()
    .int()
    .min(4 * 1024 * 1024)
    .max(migrationInventoryLimits.maxReadBytes)
    .parse(
      values["max-read-bytes"] ?? migrationInventoryLimits.defaultReadBytes,
    );
  phase = "explicit-environment";
  if (values["credentials-file"]) loadEnvFile(values["credentials-file"]);
  const uri = z.string().min(1).parse(process.env.PHOTO_MIGRATION_MONGODB_URI);
  const parsedUri = new URL(uri);
  if (
    !["mongodb:", "mongodb+srv:"].includes(parsedUri.protocol) ||
    parsedUri.host !== host
  )
    throw new Error("MongoDB host mismatch");
  phase = "authorized-inventory";
  const { MongoClient } = await import("mongodb");
  const { inventoryLegacyPhotos } =
    await import("@/server/repositories/photo-migration-inventory");
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 2,
    readPreference: "primary",
    retryReads: false,
    appName: "fleg-photo-inventory-read-only",
  });
  try {
    await client.connect();
    const inventory = await inventoryLegacyPhotos(
      client.db(appName),
      client.db(authName),
      {
        ...scope,
        actorId: actor,
        after: after ?? null,
        pageSize,
        maxReadBytes,
      },
    );
    phase = "report";
    await emit(inventory, values.output);
  } finally {
    await client.close();
  }
}

main().catch(() => {
  // Zod/driver/config errors can contain credentials: never print raw errors.
  console.error(
    `Inventaire interrompu (${phase}). Aucune migration exécutée. Vérifiez les arguments, les accès et le périmètre explicite.`,
  );
  process.exitCode = 1;
});

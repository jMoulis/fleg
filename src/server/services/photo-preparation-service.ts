import "server-only";
import { createHash } from "node:crypto";
import { offlineIdentitySchema } from "@/domain/offline/schemas";
import {
  photoPreparationInputSchema,
  preparedPhotosSchema,
} from "@/domain/attachments/photo-queue";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { requireSession } from "@/server/auth/session";
import { getAppDb } from "@/server/db/mongo-client";
import { assertAttachmentTargetExists } from "@/server/repositories/attachment-target";
import { offlinePolicySchema } from "./offline-service";
import { StoreRepository } from "@/server/repositories/store-repository";

export async function photoAccess(
  context: AuthorizedStoreContext,
  headers: Headers,
) {
  const session = await requireSession(headers);
  if (
    session.user.id !== context.userId ||
    !context.permissions.includes("attachments.write")
  )
    throw new StoreAccessDeniedError();
  return {
    identity: offlineIdentitySchema.parse({
      ...context,
      sessionBinding: createHash("sha256")
        .update(session.session.id)
        .digest("hex"),
    }),
    sessionExpiresAt: new Date(session.session.expiresAt).getTime(),
  };
}

export async function preparePhotoTarget(
  context: AuthorizedStoreContext,
  headers: Headers,
  body: unknown,
) {
  const input = photoPreparationInputSchema.parse(body);
  const access = await photoAccess(context, headers);
  const db = await getAppDb();
  const [store] = await Promise.all([
    new StoreRepository(db).getOfflineReferenceMetadata(context),
    assertAttachmentTargetExists(db, context, input.target),
  ]);
  if (!store) throw new StoreAccessDeniedError();
  const now = Date.now();
  return preparedPhotosSchema.parse({
    schemaVersion: 1,
    identity: access.identity,
    storeName: store.name,
    preparedAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Math.min(
        access.sessionExpiresAt,
        now +
          offlinePolicySchema.parse(process.env).OFFLINE_MAX_AGE_HOURS *
            3_600_000,
      ),
    ).toISOString(),
    targets: [input],
  });
}

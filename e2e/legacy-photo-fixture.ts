import { createHash } from "node:crypto";
import { Binary, MongoClient, ObjectId } from "mongodb";
import type { Page } from "@playwright/test";
import {
  attachmentTargetKey,
  attachmentsResponseSchema,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import { requireE2eEnvironment } from "@/domain/testing/e2e-environment";

// Historical BSON photos are fixtures, not a hidden production upload fallback.
// The environment guard refuses Atlas and every non-generated database name.
export async function seedLegacyPhoto(input: {
  page: Page;
  storeId: string;
  target: AttachmentTarget;
  caption: string;
}) {
  const env = requireE2eEnvironment(process.env);
  const client = await MongoClient.connect(env.MONGODB_URI);
  const id = new ObjectId();
  try {
    const db = client.db(env.MONGODB_APP_DB);
    const storeId = new ObjectId(input.storeId);
    const store = await db.collection("stores").findOne({ _id: storeId });
    const user = await client
      .db(env.MONGODB_AUTH_DB)
      .collection("user")
      .findOne({ email: process.env.E2E_EMAIL });
    if (!store || !user) throw new Error("Synthetic photo scope missing");
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const common = {
      _id: id,
      organizationId: String(store.organizationId),
      storeId,
      createdAt: new Date(),
      mimeType: "image/png",
      sizeBytes: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await db
      .collection("attachments")
      .insertOne({
        ...common,
        target: input.target,
        targetKey: attachmentTargetKey(input.target),
        caption: input.caption,
        originalFileName: "photo-recette.png",
        retentionPolicy: "until_manual_deletion",
        uploadedBy: String(user._id),
      });
    await db
      .collection("attachmentObjects")
      .insertOne({ ...common, content: new Binary(bytes) });
  } finally {
    await client.close();
  }
  const response = await input.page.request.get(
    `/api/stores/${input.storeId}/attachments`,
  );
  if (!response.ok()) throw new Error("Legacy photo listing refused");
  const photo = attachmentsResponseSchema
    .parse(await response.json())
    .attachments.find((photo) => photo.id === id.toHexString());
  if (!photo) throw new Error("Legacy photo fixture not visible");
  return photo;
}

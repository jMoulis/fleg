import { NextResponse } from "next/server";
import * as z from "zod";
import { uploadCommandSchema } from "@/domain/attachments/upload-transport";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import { getUploadLifecycle } from "@/server/services/upload-lifecycle-service";
import { requireUploadTransportConfig } from "@/server/storage/upload-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  route: { params: Promise<{ storeId: string; intentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, intentId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const id = z.uuid().parse(intentId);
    uploadCommandSchema.parse(await readUploadIntentRequest(request));
    const config = requireUploadTransportConfig();
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    const intents = new UploadIntentRepository(db, client, config);
    await intents.get(context, id); // owner + authorized tenant, before any Blob IO
    await (await getUploadLifecycle()).reconcile(context, requestId, id);
    const current = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const intent = await intents.get(current, id);
    return NextResponse.json(
      { intent, requestId },
      {
        status: intent.state === "linked" ? 200 : 202,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route:
        "/api/stores/[storeId]/attachments/upload-intents/[intentId]/verify",
      method: "POST",
    });
  }
}

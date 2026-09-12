import { NextResponse } from "next/server";
import * as z from "zod";
import { uploadCommandSchema } from "@/domain/attachments/upload-transport";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import { requireUploadIntentConfig } from "@/server/storage/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const config = requireUploadIntentConfig(process.env);
    const id = z.uuid().parse(intentId);
    uploadCommandSchema.parse(await readUploadIntentRequest(request));
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    const intent = await new UploadIntentRepository(db, client, config).cancel(
      context,
      id,
      requestId,
    );
    return NextResponse.json(
      { intent, requestId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route:
        "/api/stores/[storeId]/attachments/upload-intents/[intentId]/cancel",
      method: "POST",
    });
  }
}

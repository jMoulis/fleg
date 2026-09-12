import { NextResponse } from "next/server";
import * as z from "zod";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import { requireUploadIntentConfig } from "@/server/storage/config";
import { privateUploadsAvailable } from "@/server/storage/upload-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    const intent = await new UploadIntentRepository(db, client, config).get(
      context,
      id,
    );
    return NextResponse.json(
      {
        intent: {
          ...intent,
          uploadAvailable:
            intent.state === "reserved" && privateUploadsAvailable(),
        },
        requestId,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/upload-intents/[intentId]",
      method: "GET",
    });
  }
}

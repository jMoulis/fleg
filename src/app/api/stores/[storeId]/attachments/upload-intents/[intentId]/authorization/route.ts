import { NextResponse } from "next/server";
import * as z from "zod";
import { uploadCommandSchema } from "@/domain/attachments/upload-transport";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import {
  requireUploadTransportConfig,
  VercelUploadTransport,
} from "@/server/storage/upload-transport";

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
    const id = z.uuid().parse(intentId);
    uploadCommandSchema.parse(await readUploadIntentRequest(request));
    const config = requireUploadTransportConfig();
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    const repository = new UploadIntentRepository(db, client, config);
    const grant = await repository.beginAuthorization(context, id, requestId);
    const upload = await new VercelUploadTransport(config).authorize(
      context,
      grant,
    );
    // A session/membership/target may have changed while the provider responded.
    const currentContext = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    await repository.assertAuthorizationCurrent(currentContext, grant);
    return NextResponse.json(
      { upload, requestId },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route:
        "/api/stores/[storeId]/attachments/upload-intents/[intentId]/authorization",
      method: "POST",
    });
  }
}

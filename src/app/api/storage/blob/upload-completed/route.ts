import { NextResponse } from "next/server";
import { uploadCallbackMaxBodyBytes } from "@/domain/attachments/upload-transport";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { readBoundedUploadJson } from "@/server/http/upload-intent-request";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import {
  requireUploadTransportConfig,
  VercelUploadTransport,
} from "@/server/storage/upload-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const config = requireUploadTransportConfig();
    const body = await readBoundedUploadJson(
      request,
      uploadCallbackMaxBodyBytes,
    );
    const completion = await new VercelUploadTransport(config).verifyCompletion(
      request,
      body,
    );
    // No business link or byte fetch in the callback. ACK only after durable
    // persistence; a DB failure returns a retryable response, never a false ACK.
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    await new UploadIntentRepository(db, client, config).recordCompletion(
      completion,
      requestId,
    );
    return NextResponse.json(
      { type: "blob.upload-completed", response: "ok" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/storage/blob/upload-completed",
      method: "POST",
    });
  }
}

import { NextResponse } from "next/server";
import { requireStoreContext } from "@/server/auth/store-context";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import {
  photoAccess,
  preparePhotoTarget,
} from "@/server/services/photo-preparation-service";
import { privateUploadsAvailable } from "@/server/storage/upload-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  route: { params: Promise<{ storeId: string }> },
) {
  const method = request.method === "POST" ? "POST" : "GET";
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const result =
      method === "POST"
        ? await preparePhotoTarget(
            context,
            request.headers,
            await readUploadIntentRequest(request),
          )
        : {
            ...(await photoAccess(context, request.headers)).identity,
            uploadsAvailable: privateUploadsAvailable(context),
          };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId: crypto.randomUUID(),
      method,
      route: "/api/stores/[storeId]/attachments/offline",
    });
  }
}
export const GET = handle;
export const POST = handle;

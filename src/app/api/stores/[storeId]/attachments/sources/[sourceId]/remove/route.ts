import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireStoreContext } from "@/server/auth/store-context";
import { getUploadLifecycle } from "@/server/services/upload-lifecycle-service";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { uploadCommandSchema } from "@/domain/attachments/upload-transport";
import { documentSourceIdSchema } from "@/domain/attachments/document-source";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  route: { params: Promise<{ storeId: string; sourceId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, sourceId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const id = new ObjectId(documentSourceIdSchema.parse(sourceId));
    uploadCommandSchema.parse(await readUploadIntentRequest(request));
    const result = await (
      await getUploadLifecycle()
    ).removeSource(context, id, requestId);
    return NextResponse.json(
      { ...result, requestId },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/sources/[sourceId]/remove",
      method: "POST",
    });
  }
}

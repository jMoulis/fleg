import { NextResponse } from "next/server";
import { requireStoreContext } from "@/server/auth/store-context";
import { getUploadLifecycle } from "@/server/services/upload-lifecycle-service";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { uploadCommandSchema } from "@/domain/attachments/upload-transport";
import { maintenanceResultSchema } from "@/domain/attachments/document-source";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  route: { params: Promise<{ storeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    uploadCommandSchema.parse(await readUploadIntentRequest(request));
    const result = maintenanceResultSchema.parse(
      await (await getUploadLifecycle()).reconcile(context, requestId),
    );
    return NextResponse.json(
      { result, requestId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/maintenance",
      method: "POST",
    });
  }
}

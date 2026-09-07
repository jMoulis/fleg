import {
  attachmentIdSchema,
} from "@/domain/attachments/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { getPhotoAttachmentContent } from "@/server/services/attachment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; attachmentId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, attachmentId: rawAttachmentId } = await routeContext.params;
    const attachmentId = attachmentIdSchema.parse(rawAttachmentId);
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const { attachment, bytes } = await getPhotoAttachmentContent({
      context,
      attachmentId,
    });
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": attachment.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/[attachmentId]/content",
      method: "GET",
    });
  }
}

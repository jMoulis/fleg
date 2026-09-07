import { NextResponse } from "next/server";

import {
  attachmentDeleteInputSchema,
  attachmentDeletionResponseSchema,
  attachmentIdSchema,
} from "@/domain/attachments/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { deletePhotoAttachment } from "@/server/services/attachment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; attachmentId: string }>;
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, attachmentId: rawAttachmentId } = await routeContext.params;
    const attachmentId = attachmentIdSchema.parse(rawAttachmentId);
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const deleteInput = attachmentDeleteInputSchema.parse(await request.json());
    const deletedAttachment = await deletePhotoAttachment({
      context,
      attachmentId,
      idempotencyKey: deleteInput.idempotencyKey,
      requestId,
    });
    return NextResponse.json(
      attachmentDeletionResponseSchema.parse({ deletedAttachment, requestId }),
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/[attachmentId]",
      method: "DELETE",
    });
  }
}

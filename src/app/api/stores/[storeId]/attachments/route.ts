import { NextResponse } from "next/server";

import { PhotoValidationError } from "@/domain/attachments/photo-validation";
import {
  attachmentCreateMetadataSchema,
  attachmentPolicy,
  attachmentResponseSchema,
  attachmentsResponseSchema,
} from "@/domain/attachments/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import {
  createPhotoAttachment,
  listPhotoAttachments,
} from "@/server/services/attachment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const attachments = await listPhotoAttachments({ context });
    return NextResponse.json(
      attachmentsResponseSchema.parse({
        attachments,
        policy: attachmentPolicy,
        requestId,
      }),
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments",
      method: "GET",
    });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["attachments.write"],
      request.headers,
    );
    const form = await request.formData();
    const metadataValue = form.get("metadata");
    const fileValue = form.get("file");
    if (typeof metadataValue !== "string") {
      throw new PhotoValidationError("Les métadonnées de la photo sont requises");
    }
    if (!(fileValue instanceof File)) {
      throw new PhotoValidationError("Sélectionnez une photo");
    }
    const metadata = attachmentCreateMetadataSchema.parse(
      JSON.parse(metadataValue) as unknown,
    );
    const attachment = await createPhotoAttachment({
      context,
      metadata,
      file: fileValue,
      requestId,
    });
    return NextResponse.json(
      attachmentResponseSchema.parse({ attachment, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments",
      method: "POST",
    });
  }
}

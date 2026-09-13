import { NextResponse } from "next/server";

import { PrivateStorageError } from "@/domain/attachments/private-storage";
import {
  attachmentPolicy,
  attachmentsResponseSchema,
} from "@/domain/attachments/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import { listPhotoAttachments } from "@/server/services/attachment-service";

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
    await requireStoreContext(storeId, ["attachments.write"], request.headers);
    // Old tabs must not silently keep writing binaries to MongoDB, even when
    // Blob is disabled or unavailable. The intent flow is now the only writer.
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "Cet ancien mode d’envoi est désactivé. Actualisez la page pour ajouter une photo via le stockage privé.",
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

import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  importPreviewResponseSchema,
  importUploadSchema,
} from "@/domain/imports/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { getImportEnv } from "@/server/env";
import { createMercalysPreview } from "@/server/services/import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["imports.create"],
      request.headers,
    );
    const formData = await request.formData();
    const input = importUploadSchema.parse({ file: formData.get("file") });
    const { IMPORT_MAX_BYTES } = getImportEnv();

    if (input.file.size > IMPORT_MAX_BYTES) {
      return NextResponse.json(
        apiErrorSchema.parse({
          code: "IMPORT_FILE_TOO_LARGE",
          message: `Le fichier dépasse la limite de ${Math.round(IMPORT_MAX_BYTES / 1_000_000)} Mo`,
          requestId,
        }),
        { status: 413 },
      );
    }

    const record = await createMercalysPreview({
      context,
      fileName: input.file.name,
      bytes: new Uint8Array(await input.file.arrayBuffer()),
    });

    return NextResponse.json(
      importPreviewResponseSchema.parse({
        ...record.preview,
        importId: record.importId,
        fingerprint: record.fingerprint,
        unresolvedAliases: record.unresolvedAliases,
        requestId,
      }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const response = apiErrorSchema.parse({
      code: unauthorized ? "STORE_NOT_FOUND_OR_FORBIDDEN" : "IMPORT_PREVIEW_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : "Le fichier Mercalys n’a pas pu être prévisualisé",
      requestId,
    });

    return NextResponse.json(response, { status: unauthorized ? 404 : 400 });
  }
}

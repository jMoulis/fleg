import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  importCommitInputSchema,
  importCommitResponseSchema,
} from "@/domain/imports/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { commitMercalysImport } from "@/server/services/import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; importId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId, importId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["imports.commit"],
      request.headers,
    );
    const input = importCommitInputSchema.parse(await request.json());
    const result = await commitMercalysImport({
      context,
      importId,
      resolutions: input.resolutions,
      requestId,
    });

    return NextResponse.json(
      importCommitResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : "IMPORT_COMMIT_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : "L’import n’a pas pu être validé",
        requestId,
      }),
      { status: unauthorized ? 404 : 400 },
    );
  }
}

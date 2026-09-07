import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  dailyImportCommitInputSchema,
  dailyImportCommitResponseSchema,
} from "@/domain/imports/daily-schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { DailyStoreCodeMismatchError } from "@/server/repositories/daily-sales-import-repository";
import { commitDailyMercalysImport } from "@/server/services/daily-sales-import-service";

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
    const input = dailyImportCommitInputSchema.parse(await request.json());
    const result = await commitDailyMercalysImport({
      context,
      importId,
      resolutions: input.resolutions,
      requestId,
    });

    return NextResponse.json(
      dailyImportCommitResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const codeMismatch = error instanceof DailyStoreCodeMismatchError;

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : codeMismatch
            ? "IMPORT_STORE_CODE_MISMATCH"
            : "DAILY_IMPORT_COMMIT_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : codeMismatch
            ? error.message
            : "L’import journalier n’a pas pu être validé",
        requestId,
      }),
      { status: unauthorized ? 404 : 400 },
    );
  }
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { DocumentManager } from "@/components/documents/document-manager";
import { documentSourceIdSchema } from "@/domain/attachments/document-source";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { DocumentSourceRepository } from "@/server/repositories/document-source-repository";
import { privateUploadsAvailable } from "@/server/storage/upload-transport";

export const metadata: Metadata = { title: "Documents — F&L Cockpit" };
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [{ organizationSlug, storeId }, search, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["stores.read"],
    requestHeaders,
  );
  const cursor = documentSourceIdSchema.safeParse(search.cursor);
  const documents = await new DocumentSourceRepository(await getAppDb()).list(
    context,
    cursor.success ? cursor.data : undefined,
  );
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Conservez les PDF de votre magasin. Leur ajout ne déclenche pas
        d’analyse IA.
      </p>
      <DocumentManager
        key={`${context.userId}:${storeId}`}
        storeId={storeId}
        userId={context.userId}
        basePath={`/${organizationSlug}/stores/${storeId}/documents`}
        documents={documents}
        hasCursor={cursor.success}
        canWrite={context.permissions.includes("attachments.write")}
        uploadsAvailable={privateUploadsAvailable()}
      />
    </main>
  );
}

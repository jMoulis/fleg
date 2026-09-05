import "server-only";

import type {
  MarkdownCreateInput,
  MarkdownListQuery,
} from "@/domain/markdown/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { MarkdownRepository } from "@/server/repositories/markdown-repository";

export async function listMarkdown(input: {
  context: AuthorizedStoreContext;
  query: MarkdownListQuery;
}) {
  return new MarkdownRepository(await getAppDb()).listForStore(
    input.context,
    input.query,
  );
}

export async function createMarkdown(input: {
  context: AuthorizedStoreContext;
  createInput: MarkdownCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new MarkdownRepository(db, client).create(input);
}

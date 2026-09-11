import "server-only";
import { createHash } from "node:crypto";
import { requireSession } from "@/server/auth/session";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

/** Existing API callers remain compatible; local work is fenced to its exact session. */
export async function assertInventorySessionBinding(headers: Headers) {
  const expected = headers.get("x-fleg-session-binding");
  if (expected === null) return;
  const { session } = await requireSession(headers);
  if (createHash("sha256").update(session.id).digest("hex") !== expected)
    throw new StoreAccessDeniedError();
}

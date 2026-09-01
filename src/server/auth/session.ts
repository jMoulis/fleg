import "server-only";

import { headers } from "next/headers";

import { getAuth } from "@/server/auth/auth";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentification requise");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getSession(requestHeaders?: Headers) {
  const auth = await getAuth();

  return auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
}

export async function requireSession(requestHeaders?: Headers) {
  const session = await getSession(requestHeaders);

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  return session;
}

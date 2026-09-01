import "server-only";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { getAuthDb, getMongoClient } from "@/server/db/mongo-client";
import { getAuthEnv } from "@/server/env";

async function createAuth() {
  const [client, authDb, env] = await Promise.all([
    getMongoClient(),
    getAuthDb(),
    getAuthEnv(),
  ]);

  return betterAuth({
    appName: "F&L Cockpit",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(authDb, { client }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !env.AUTH_ALLOW_SIGN_UP,
    },
    advanced: {
      database: {
        joins: true,
      },
    },
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    plugins: [organization(), nextCookies()],
  });
}

type Auth = Awaited<ReturnType<typeof createAuth>>;

let authPromise: Promise<Auth> | undefined;

export function getAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = createAuth();
  }

  return authPromise;
}

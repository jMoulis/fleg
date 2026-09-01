import "server-only";

import { Db, MongoClient, ServerApiVersion } from "mongodb";

import { getServerEnv } from "@/server/env";

declare global {
  var flMongoClientPromise: Promise<MongoClient> | undefined;
}

function createMongoClient(): MongoClient {
  const { MONGODB_URI } = getServerEnv();

  return new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.flMongoClientPromise) {
    globalThis.flMongoClientPromise = createMongoClient().connect();
  }

  return globalThis.flMongoClientPromise;
}

export async function getAuthDb(): Promise<Db> {
  const [client, env] = await Promise.all([getMongoClient(), getServerEnv()]);
  return client.db(env.MONGODB_AUTH_DB);
}

export async function getAppDb(): Promise<Db> {
  const [client, env] = await Promise.all([getMongoClient(), getServerEnv()]);
  return client.db(env.MONGODB_APP_DB);
}

export async function pingMongo(): Promise<void> {
  const client = await getMongoClient();
  await client.db("admin").command({ ping: 1 });
}

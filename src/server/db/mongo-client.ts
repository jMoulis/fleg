import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { Db, MongoClient, ServerApiVersion } from "mongodb";

import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";
import { getServerEnv } from "@/server/env";

declare global {
  var flMongoClientPromise: Promise<MongoClient> | undefined;
  var flFoundationIndexesPromise: Promise<void> | undefined;
}

function createMongoClient(): MongoClient {
  const environment = getServerEnv();

  const client = new MongoClient(environment.MONGODB_URI, {
    connectTimeoutMS: environment.MONGODB_CONNECT_TIMEOUT_MS,
    maxIdleTimeMS: environment.MONGODB_MAX_IDLE_TIME_MS,
    maxPoolSize: environment.MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  attachDatabasePool(client);
  return client;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.flMongoClientPromise) {
    const connectionPromise = createMongoClient().connect();
    globalThis.flMongoClientPromise = connectionPromise;
    void connectionPromise.catch(() => {
      if (globalThis.flMongoClientPromise === connectionPromise) {
        globalThis.flMongoClientPromise = undefined;
      }
    });
  }

  return globalThis.flMongoClientPromise;
}

export async function getAuthDb(): Promise<Db> {
  const [client, env] = await Promise.all([getMongoClient(), getServerEnv()]);
  return client.db(env.MONGODB_AUTH_DB);
}

export async function getAppDb(): Promise<Db> {
  const [client, env] = await Promise.all([getMongoClient(), getServerEnv()]);
  const db = client.db(env.MONGODB_APP_DB);

  if (!globalThis.flFoundationIndexesPromise) {
    const indexesPromise = ensureFoundationIndexesForDb(db);
    globalThis.flFoundationIndexesPromise = indexesPromise;
    void indexesPromise.catch(() => {
      if (globalThis.flFoundationIndexesPromise === indexesPromise) {
        globalThis.flFoundationIndexesPromise = undefined;
      }
    });
  }

  await globalThis.flFoundationIndexesPromise;
  return db;
}

export async function pingMongo(): Promise<void> {
  const client = await getMongoClient();
  await client.db("admin").command({ ping: 1 });
}
